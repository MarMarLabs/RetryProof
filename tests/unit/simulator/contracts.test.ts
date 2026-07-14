import { describe, expect, it } from "vitest";

import refundFixture from "../../../fixtures/simulator/refund-fixture.json";
import refundInvariant from "../../../fixtures/simulator/refund-invariant.json";
import repairedWorkflow from "../../../fixtures/simulator/refund-workflow-repaired.json";
import refundScenarios from "../../../fixtures/simulator/refund-scenarios.json";
import refundWorkflow from "../../../fixtures/simulator/refund-workflow.json";
import {
  invariantSchema,
  scenarioSchema,
  workflowSnapshotSchema,
} from "@/domain";
import { simulationFixtureSchema } from "@/lib/simulator";

describe("versioned simulator contracts", () => {
  it("accepts every refund seed artifact", () => {
    expect(workflowSnapshotSchema.parse(refundWorkflow).id).toBe("wf_demo_refund");
    expect(workflowSnapshotSchema.parse(repairedWorkflow).nodes).toHaveLength(9);
    expect(simulationFixtureSchema.parse(refundFixture).httpMocks).toHaveLength(1);
    expect(invariantSchema.parse(refundInvariant).approved).toBe(true);
    expect(refundScenarios.map((item) => scenarioSchema.parse(item).type)).toEqual([
      "duplicate_delivery",
      "effect_succeeded_then_timeout",
      "rate_limited_then_retry",
      "partial_failure_then_retry",
    ]);
  });

  it("rejects unknown graph references and arbitrary expression syntax", () => {
    expect(() =>
      workflowSnapshotSchema.parse({
        ...refundWorkflow,
        nodes: [
          {
            id: "entry",
            name: "Entry",
            type: "webhook",
            next: "missing",
          },
        ],
        entryNodeId: "entry",
      }),
    ).toThrow(/Unknown node reference/);

    expect(() =>
      workflowSnapshotSchema.parse({
        ...refundWorkflow,
        nodes: [
          {
            id: "entry",
            name: "Entry",
            type: "set",
            assignments: [
              {
                targetPath: "$.ok",
                value: { kind: "json_path", path: "$.constructor.prototype" },
              },
            ],
          },
        ],
        entryNodeId: "entry",
      }),
    ).toThrow();
  });
});
