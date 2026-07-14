import {
  invariantSchema,
  scenarioSchema,
  simulationArtifactSchema,
  workflowSnapshotSchema,
  type Invariant,
  type JsonValue,
  type Scenario,
  type SimulationArtifact,
  type WorkflowNode,
  type WorkflowSnapshot,
} from "@/domain";

import { LogicalReservationStore } from "./adapters/reservation-store";
import { MockHttpAdapter } from "./adapters/mock-http";
import {
  simulationFixtureSchema,
  type SimulationFixture,
} from "./contracts";
import {
  evaluateCondition,
  evaluateExpression,
  writeJsonPath,
} from "./expressions";
import { SideEffectLedger } from "./ledger";
import { evaluateAtMostOnce } from "./oracles/at-most-once";
import { deterministicHash, deterministicSerialize } from "./serialization";
import { DeterministicWorld } from "./world";

const LIMITATIONS = [
  "Verdicts apply only to the declared deterministic fault model and approved invariant.",
  "RetryProof does not claim exactly-once execution or production safety.",
  "No real network, workflow code, JavaScript, or SQL is executed.",
] as const;

class InjectedFault extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "InjectedFault";
  }
}

export interface RunScenarioInput {
  workflow: WorkflowSnapshot;
  fixture: SimulationFixture;
  invariants: Invariant[];
  scenario: Scenario;
  seed: string;
}

export interface RunSuiteInput extends Omit<RunScenarioInput, "scenario"> {
  scenarios: Scenario[];
}

export interface SimulationSuite {
  schemaVersion: "1";
  workflowId: string;
  seed: string;
  passed: boolean;
  results: SimulationArtifact[];
  suiteHash: string;
}

function toEffectKey(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return deterministicSerialize(value);
}

function mapExpressions(
  values: Record<string, { kind: "literal"; value: JsonValue } | { kind: "json_path"; path: string }>,
  context: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, expression]) => [key, evaluateExpression(expression, context)]),
  );
}

function nextForNode(
  node: WorkflowNode,
  context: Record<string, JsonValue>,
  reservations: LogicalReservationStore,
  world: DeterministicWorld,
  delivery: number,
): string | null | undefined {
  switch (node.type) {
    case "webhook":
    case "set":
    case "http_request":
      return node.next;
    case "if":
      return evaluateCondition(node.condition, context) ? node.whenTrue : node.whenFalse;
    case "switch": {
      const value = evaluateExpression(node.value, context);
      const matched = node.cases.find(
        (item) =>
          deterministicSerialize(evaluateExpression(item.equals, context)) ===
          deterministicSerialize(value),
      );
      return matched?.next ?? node.defaultNext;
    }
    case "reservation": {
      const key = toEffectKey(evaluateExpression(node.key, context));
      const acquired = reservations.reserve(node.namespace, key);
      world.record(acquired ? "reservation_acquired" : "reservation_conflict", {
        delivery,
        nodeId: node.id,
        details: { namespace: node.namespace, key },
      });
      return acquired ? node.acquiredNext : node.conflictNext;
    }
    case "respond":
      return null;
  }
}

function validateExecution(input: RunScenarioInput): RunScenarioInput {
  const workflow = workflowSnapshotSchema.parse(input.workflow);
  const fixture = simulationFixtureSchema.parse(input.fixture);
  const scenario = scenarioSchema.parse(input.scenario);
  const invariants = input.invariants.map((invariant) => invariantSchema.parse(invariant));
  if (!input.seed || input.seed.length > 128) throw new Error("seed must contain 1-128 characters");

  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const target = nodes.get(scenario.targetNodeId);
  if (!target) throw new Error("scenario targetNodeId must reference an existing node");
  if (
    (scenario.type === "effect_succeeded_then_timeout" ||
      scenario.type === "rate_limited_then_retry") &&
    (target.type !== "http_request" || !target.effect)
  ) {
    throw new Error(`${scenario.type} requires an effectful HTTP target node`);
  }

  const invariantIds = new Set(invariants.map((invariant) => invariant.id));
  for (const invariant of invariants) {
    if (!invariant.approved) throw new Error(`Invariant ${invariant.id} is not approved`);
    for (const nodeId of invariant.sourceNodeIds) {
      if (!nodes.has(nodeId)) throw new Error(`Invariant cites unknown source node: ${nodeId}`);
    }
  }
  for (const invariantId of scenario.expectedInvariantIds) {
    if (!invariantIds.has(invariantId)) {
      throw new Error(`Scenario expects unavailable invariant: ${invariantId}`);
    }
  }

  const mockRoutes = new Set(fixture.httpMocks.map((mock) => mock.routeId));
  for (const node of workflow.nodes) {
    if (node.type === "http_request" && !mockRoutes.has(node.routeId)) {
      throw new Error(`No mock is declared for HTTP route: ${node.routeId}`);
    }
  }

  return { workflow, fixture, scenario, invariants, seed: input.seed };
}

export function runScenario(unvalidated: RunScenarioInput): SimulationArtifact {
  const { workflow, fixture, invariants, scenario, seed } = validateExecution(unvalidated);
  const world = new DeterministicWorld(seed, scenario.id);
  const ledger = new SideEffectLedger(world);
  const reservations = new LogicalReservationStore();
  const http = new MockHttpAdapter(fixture.httpMocks, ledger, world);
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  let faultInjected = false;

  const inject = (delivery: number, nodeId: string, phase: Scenario["faultPhase"]): never => {
    faultInjected = true;
    world.record("fault_injected", {
      delivery,
      nodeId,
      details: { phase, scenarioType: scenario.type },
    });
    throw new InjectedFault(`INJECTED_${phase.toUpperCase()}`);
  };

  for (let delivery = 1; delivery <= scenario.deliveries; delivery += 1) {
    if (
      scenario.type === "duplicate_delivery" &&
      delivery === 2 &&
      !faultInjected
    ) {
      faultInjected = true;
      world.record("fault_injected", {
        delivery,
        nodeId: scenario.targetNodeId,
        details: {
          phase: "before_replayed_delivery",
          scenarioType: scenario.type,
        },
      });
    }

    world.record("delivery_started", {
      delivery,
      details: { replayed: delivery > 1 },
    });
    let context = structuredClone(fixture.input);
    let currentNodeId: string | null | undefined = workflow.entryNodeId;
    let steps = 0;
    try {
      while (currentNodeId) {
        steps += 1;
        if (steps > 200) throw new Error("Workflow exceeded the deterministic step limit");
        const node = nodes.get(currentNodeId);
        if (!node) throw new Error(`Workflow referenced an unknown node: ${currentNodeId}`);
        world.record("node_started", { delivery, nodeId: node.id });

        if (
          scenario.type === "rate_limited_then_retry" &&
          delivery === 1 &&
          node.id === scenario.targetNodeId &&
          !faultInjected
        ) {
          inject(delivery, node.id, "before_effect");
        }

        if (node.type === "set") {
          for (const assignment of node.assignments) {
            context = writeJsonPath(
              context,
              assignment.targetPath,
              evaluateExpression(assignment.value, context),
            );
          }
        } else if (node.type === "http_request") {
          const body = mapExpressions(node.body, context);
          http.request({
            routeId: node.routeId,
            method: node.method,
            path: node.path,
            body,
            ...(node.effect
              ? {
                  effect: {
                    effectId: node.effect.id,
                    key: toEffectKey(evaluateExpression(node.effect.key, context)),
                    nodeId: node.id,
                    delivery,
                  },
                  afterEffect: () => {
                    if (
                      scenario.type === "effect_succeeded_then_timeout" &&
                      delivery === 1 &&
                      node.id === scenario.targetNodeId &&
                      !faultInjected
                    ) {
                      inject(delivery, node.id, "after_effect_before_response");
                    }
                  },
                }
              : {}),
          });
        } else if (node.type === "respond") {
          world.record("response_emitted", {
            delivery,
            nodeId: node.id,
            details: { status: node.status, body: mapExpressions(node.body, context) },
          });
        }

        const next = nextForNode(node, context, reservations, world, delivery);
        world.record("node_completed", { delivery, nodeId: node.id });
        if (
          scenario.type === "partial_failure_then_retry" &&
          delivery === 1 &&
          node.id === scenario.targetNodeId &&
          !faultInjected
        ) {
          inject(delivery, node.id, "after_node");
        }
        currentNodeId = next;
      }
      world.record("delivery_completed", { delivery });
    } catch (error) {
      if (!(error instanceof InjectedFault)) throw error;
      world.record("delivery_failed", {
        delivery,
        details: { errorCode: error.code },
      });
    }
  }

  if (!faultInjected) throw new Error("Scenario completed without injecting its declared fault");
  const effects = ledger.snapshot();
  const selectedInvariants = invariants.filter((invariant) =>
    scenario.expectedInvariantIds.includes(invariant.id),
  );
  const verdicts = selectedInvariants.map((invariant) =>
    evaluateAtMostOnce(invariant, effects),
  );
  for (const verdict of verdicts) {
    world.record("invariant_evaluated", {
      details: {
        invariantId: verdict.invariantId,
        passed: verdict.passed,
        maximumObserved: verdict.maximumObserved,
        violatingKeys: verdict.violatingKeys,
      },
    });
  }
  const trace = world.snapshotTrace();
  const artifact: SimulationArtifact = {
    schemaVersion: "1",
    artifactType: "simulation_result",
    workflowId: workflow.id,
    scenarioId: scenario.id,
    seed,
    passed: verdicts.every((verdict) => verdict.passed),
    effects,
    verdicts,
    trace,
    traceHash: deterministicTraceHash(trace),
    limitations: [...LIMITATIONS],
  };
  return simulationArtifactSchema.parse(artifact);
}

export function runSuite(input: RunSuiteInput): SimulationSuite {
  if (input.scenarios.length === 0) throw new Error("runSuite requires at least one scenario");
  const results = input.scenarios.map((scenario) => runScenario({ ...input, scenario }));
  const withoutHash = {
    schemaVersion: "1" as const,
    workflowId: results[0]!.workflowId,
    seed: input.seed,
    passed: results.every((result) => result.passed),
    results,
  };
  return { ...withoutHash, suiteHash: deterministicHash(withoutHash) };
}

export function deterministicTraceHash(trace: SimulationArtifact["trace"]): string {
  return deterministicHash(trace);
}
