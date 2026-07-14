import { describe, expect, it } from "vitest";

import { DEMO_N8N_WORKFLOW } from "@/lib/lab/demo";
import { toSimulatorWorkflow } from "@/lib/lab/translator";
import { N8N_NODE_TYPES, POSTGRES_RESERVATION_QUERY } from "@/lib/n8n";

describe("n8n deterministic translator", () => {
  it("translates the declared demo subset without executing source content", () => {
    const result = toSimulatorWorkflow(DEMO_N8N_WORKFLOW, "wf_translated");
    expect(result.entryNodeId).toBe("webhook_refund");
    expect(result.nodes.find((node) => node.id === "http_refund")).toMatchObject({
      type: "http_request",
      method: "POST",
      path: "/refunds",
      effect: { id: "refunds" },
    });
    expect(result.nodes).toHaveLength(6);
  });

  it("translates simple n8n Switch equality rules into explicit deterministic cases", () => {
    const workflow = structuredClone(DEMO_N8N_WORKFLOW);
    const decision = workflow.nodes[2]!;
    decision.type = "n8n-nodes-base.switch";
    decision.typeVersion = 3.2;
    decision.parameters = {
      rules: {
        values: [
          {
            conditions: {
              conditions: [
                {
                  leftValue: "={{ $json.event.type }}",
                  rightValue: "refund.requested",
                },
              ],
            },
          },
        ],
      },
    };
    const result = toSimulatorWorkflow(workflow, "wf_switch");
    expect(result.nodes.find((node) => node.id === decision.id)).toMatchObject({
      type: "switch",
      value: { kind: "json_path", path: "$.event.type" },
      cases: [
        {
          equals: { kind: "literal", value: "refund.requested" },
          next: "http_refund",
        },
      ],
      defaultNext: "respond_ok",
    });
  });

  it("collapses the validated reservation decision into deterministic acquired and conflict paths", () => {
    const workflow = structuredClone(DEMO_N8N_WORKFLOW);
    workflow.nodes.push(
      {
        id: "reserve_event_key",
        name: "RetryProof · Reserve event key",
        type: N8N_NODE_TYPES.postgres,
        typeVersion: 2.6,
        position: [720, 300],
        alwaysOutputData: true,
        parameters: {
          operation: "executeQuery",
          query: POSTGRES_RESERVATION_QUERY,
          options: { queryReplacement: "={{ $json.retryProofReservationValues }}" },
        },
      },
      {
        id: "reservation_acquired",
        name: "RetryProof · Reservation acquired?",
        type: N8N_NODE_TYPES.if,
        typeVersion: 2.2,
        position: [820, 300],
        parameters: {
          conditions: {
            conditions: [{
              leftValue: "={{ $json.entity_key }}",
              rightValue: "",
              operator: { type: "string", operation: "isNotEmpty" },
            }],
          },
        },
      },
    );
    workflow.connections["Check event"]!.main[0]![0]!.node = "RetryProof · Reserve event key";
    workflow.connections["RetryProof · Reserve event key"] = {
      main: [[{ node: "RetryProof · Reservation acquired?", type: "main", index: 0 }]],
    };
    workflow.connections["RetryProof · Reservation acquired?"] = {
      main: [
        [{ node: "Create refund", type: "main", index: 0 }],
        [{ node: "Acknowledge", type: "main", index: 0 }],
      ],
    };

    const result = toSimulatorWorkflow(workflow, "wf_repaired");
    expect(result.nodes.find((node) => node.id === "reserve_event_key")).toMatchObject({
      type: "reservation",
      acquiredNext: "http_refund",
      conflictNext: "respond_ok",
    });
  });
});
