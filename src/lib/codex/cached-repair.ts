import {
  N8N_NODE_TYPES,
  POSTGRES_RESERVATION_QUERY,
  N8nWorkflowExportSchema,
} from "@/lib/n8n";
import { simulationFixtureSchema } from "@/lib/simulator";
import { invariantSchema, scenarioSchema, type Invariant, type Scenario } from "@/domain";

import type { RegressionFixture, RepairProposal } from "./schemas";

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function locateRepairSites(workflowInput: Record<string, unknown>) {
  const workflow = N8nWorkflowExportSchema.parse(workflowInput);
  const effectIndex = workflow.nodes.findIndex((node) => node.id === "http_refund");
  const normalizeIndex = workflow.nodes.findIndex(
    (node) => node.id === "normalize_event" && node.type === N8N_NODE_TYPES.set,
  );
  const response = workflow.nodes.find(
    (node) => node.type === N8N_NODE_TYPES.respondToWebhook,
  );
  if (effectIndex < 0 || normalizeIndex < 0 || !response) {
    throw new Error(
      "The cached repair requires normalize_event, http_refund, and response nodes.",
    );
  }

  const effect = workflow.nodes[effectIndex];
  let incoming:
    | { sourceId: string; sourceName: string; outputIndex: number; targetIndex: number }
    | undefined;
  for (const [sourceName, connection] of Object.entries(workflow.connections)) {
    connection.main.some((output, outputIndex) =>
      output.some((target, targetIndex) => {
        if (target.node !== effect.name) return false;
        const source = workflow.nodes.find((node) => node.name === sourceName);
        if (!source) return false;
        incoming = { sourceId: source.id, sourceName, outputIndex, targetIndex };
        return true;
      }),
    );
    if (incoming) break;
  }
  if (!incoming) throw new Error("The refund effect has no incoming graph edge.");

  return { workflow, normalizeIndex, effectIndex, effect, response, incoming };
}

export function createCachedRepair(input: {
  sourceHash: string;
  invariantId: string;
  workflow: Record<string, unknown>;
  regressionFixture: RegressionFixture;
  generatedAt?: string;
}): RepairProposal {
  const { workflow, normalizeIndex, effectIndex, effect, response, incoming } =
    locateRepairSites(input.workflow);
  const reservationName = "RetryProof · Reserve event key";
  const branchName = "RetryProof · Reservation acquired?";
  const workflowId = workflow.id ?? input.sourceHash;

  return {
    patch: [
      {
        op: "add",
        path: `/nodes/${normalizeIndex}/parameters/assignments/assignments/-`,
        value: {
          id: "retryproof-reservation-values",
          name: "retryProofReservationValues",
          type: "array",
          value: [workflowId, input.invariantId, "={{ $json.event.id }}"],
        },
      },
      {
        op: "add",
        path: "/nodes/-",
        value: {
          id: "reserve_event_key",
          name: reservationName,
          type: N8N_NODE_TYPES.postgres,
          typeVersion: 2.6,
          position: [720, 300],
          alwaysOutputData: true,
          parameters: {
            operation: "executeQuery",
            query: POSTGRES_RESERVATION_QUERY,
            options: {
              queryReplacement: "={{ $json.retryProofReservationValues }}",
            },
          },
        },
      },
      {
        op: "add",
        path: "/nodes/-",
        value: {
          id: "reservation_acquired",
          name: branchName,
          type: N8N_NODE_TYPES.if,
          typeVersion: 2.2,
          position: [820, 300],
          parameters: {
            conditions: {
              options: {},
              conditions: [
                {
                  leftValue: "={{ $json.entity_key }}",
                  rightValue: "",
                  operator: { type: "string", operation: "isNotEmpty" },
                },
              ],
            },
          },
        },
      },
      {
        op: "replace",
        path: `/connections/${pointerSegment(incoming.sourceName)}/main/${incoming.outputIndex}/${incoming.targetIndex}/node`,
        value: reservationName,
      },
      {
        op: "add",
        path: `/connections/${pointerSegment(reservationName)}`,
        value: { main: [[{ node: branchName, type: "main", index: 0 }]] },
      },
      {
        op: "add",
        path: `/connections/${pointerSegment(branchName)}`,
        value: {
          main: [
            [{ node: effect.name, type: "main", index: 0 }],
            [{ node: response.name, type: "main", index: 0 }],
          ],
        },
      },
      {
        op: "add",
        path: `/nodes/${effectIndex}/parameters/headerParameters`,
        value: {
          parameters: [
            { name: "Idempotency-Key", value: "={{ $json.event.id }}" },
          ],
        },
      },
    ],
    regressionFixture: input.regressionFixture,
    manifest: {
      schemaVersion: "1",
      sourceHash: input.sourceHash,
      invariantId: input.invariantId,
      strategy: "durable_reservation_before_effect",
      changedNodeIds: [
        workflow.nodes[normalizeIndex]!.id,
        incoming.sourceId,
        "reserve_event_key",
        "reservation_acquired",
        effect.id,
      ].sort(),
      generatedAt: input.generatedAt ?? new Date(0).toISOString(),
      generatedBy: "cached-template",
      limitations: [
        "Validated only against RetryProof's supported deterministic node semantics",
        "Requires the supplied reservation table and Postgres credentials to be configured after import",
        "This repair does not establish exactly-once execution or production safety",
      ],
    },
    readme: `# RetryProof repair\n\nThis patch reserves the approved event key before the refund side effect, routes duplicate reservations to the existing response, and propagates the event ID as the provider idempotency key.\n\nCreate the reservation table from the included setup instructions and run the regression fixture against RetryProof's declared fault model. Green means the approved invariant passed those scenarios only; it is not a production safety guarantee.`,
    explanation:
      "Reserve event.id durably before the refund side effect, route duplicate deliveries around the effect, and propagate the same key to the provider. The patch is bound to the approved invariant and source hash.",
    provenance: { mode: "cached", attempts: 1 },
  };
}

export function createRegressionFixture(input: {
  fixture: unknown;
  scenarios: readonly Scenario[];
  invariant: Invariant;
  failingScenarioIds: readonly string[];
  seed: string;
}): RegressionFixture {
  const fixture = simulationFixtureSchema.parse(input.fixture);
  const invariant = invariantSchema.parse(input.invariant);
  const failingIds = new Set(input.failingScenarioIds);
  const scenarios = input.scenarios
    .filter((scenario) => failingIds.has(scenario.id))
    .map((scenario) => scenarioSchema.parse(scenario));
  if (scenarios.length === 0) {
    throw new Error("A regression fixture requires at least one failing scenario.");
  }
  return {
    schemaVersion: "1",
    fixture,
    scenarios,
    seed: input.seed,
    invariant,
    expected: { beforePassed: false, afterPassed: true },
  };
}
