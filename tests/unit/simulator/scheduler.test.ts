import { describe, expect, it } from "vitest";

import refundFixtureJson from "../../../fixtures/simulator/refund-fixture.json";
import refundInvariantJson from "../../../fixtures/simulator/refund-invariant.json";
import repairedWorkflowJson from "../../../fixtures/simulator/refund-workflow-repaired.json";
import refundScenariosJson from "../../../fixtures/simulator/refund-scenarios.json";
import refundWorkflowJson from "../../../fixtures/simulator/refund-workflow.json";
import {
  invariantSchema,
  scenarioSchema,
  workflowSnapshotSchema,
} from "@/domain";
import {
  deterministicTraceHash,
  runScenario,
  runSuite,
  simulationFixtureSchema,
} from "@/lib/simulator";

const workflow = workflowSnapshotSchema.parse(refundWorkflowJson);
const repairedWorkflow = workflowSnapshotSchema.parse(repairedWorkflowJson);
const fixture = simulationFixtureSchema.parse(refundFixtureJson);
const invariant = invariantSchema.parse(refundInvariantJson);
const scenarios = refundScenariosJson.map((item) => scenarioSchema.parse(item));
const timeoutScenario = scenarios[1];

describe("deterministic retry scheduler", () => {
  it("produces exactly two refund effects before repair and one after repair", () => {
    const red = runScenario({
      workflow,
      fixture,
      invariants: [invariant],
      scenario: timeoutScenario,
      seed: "demo-v1",
    });
    const green = runScenario({
      workflow: repairedWorkflow,
      fixture,
      invariants: [invariant],
      scenario: timeoutScenario,
      seed: "demo-v1",
    });

    expect(red.effects).toHaveLength(2);
    expect(red.passed).toBe(false);
    expect(red.verdicts[0]).toMatchObject({ maximumObserved: 2, passed: false });
    expect(green.effects).toHaveLength(1);
    expect(green.passed).toBe(true);
    expect(green.verdicts[0]).toMatchObject({ maximumObserved: 1, passed: true });
  });

  it("runs all four fault scenarios with their declared fault phase", () => {
    const suite = runSuite({
      workflow,
      fixture,
      invariants: [invariant],
      scenarios,
      seed: "suite-v1",
    });

    expect(suite.results).toHaveLength(4);
    for (const [index, result] of suite.results.entries()) {
      const faults = result.trace.events.filter((event) => event.type === "fault_injected");
      expect(faults).toHaveLength(1);
      expect(faults[0]?.details.phase).toBe(scenarios[index]?.faultPhase);
    }
    expect(suite.results.map((result) => result.effects.length)).toEqual([2, 2, 1, 2]);
  });

  it("is byte-for-byte repeatable across repeated identical seeds", () => {
    const outputs = Array.from({ length: 25 }, () =>
      runScenario({
        workflow,
        fixture,
        invariants: [invariant],
        scenario: timeoutScenario,
        seed: "repeat-v1",
      }),
    );
    const first = JSON.stringify(outputs[0]);
    expect(outputs.every((output) => JSON.stringify(output) === first)).toBe(true);
    expect(outputs.every((output) => output.traceHash === outputs[0]?.traceHash)).toBe(true);
    expect(deterministicTraceHash(outputs[0]!.trace)).toBe(outputs[0]!.traceHash);
  });

  it("refuses unapproved invariants and invalid target nodes", () => {
    expect(() =>
      runScenario({
        workflow,
        fixture,
        invariants: [{ ...invariant, approved: false }],
        scenario: timeoutScenario,
        seed: "demo-v1",
      }),
    ).toThrow(/approved/);

    expect(() =>
      runScenario({
        workflow,
        fixture,
        invariants: [invariant],
        scenario: { ...timeoutScenario, targetNodeId: "invented_node" },
        seed: "demo-v1",
      }),
    ).toThrow(/targetNodeId/);
  });
});
