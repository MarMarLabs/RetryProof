import type { RiskPlan } from "./schemas";

export const CACHED_DEMO_PLAN: RiskPlan = {
  schemaVersion: "1",
  workflowId: "wf_demo_refund",
  sideEffects: [
    {
      id: "se_refund",
      nodeId: "http_refund",
      kind: "external_write",
      operation: "POST /refunds",
      reversibility: "irreversible",
      keyCandidates: [
        {
          jsonPath: "$.event.id",
          confidence: 0.94,
          evidencePaths: ["$.nodes.3.parameters.body.event_id"],
        },
      ],
      evidence: [
        {
          nodeId: "http_refund",
          jsonPath: "$.nodes.3.parameters.method",
          observedValue: "POST",
          label: "observed",
        },
        {
          nodeId: "http_refund",
          jsonPath: "$.nodes.3.parameters.url",
          observedValue: "mock://refunds",
          label: "observed",
        },
      ],
      confidence: 0.96,
      requiresConfirmation: true,
    },
  ],
  invariants: [
    {
      id: "inv_refund_once",
      statement: "At most one refund effect per event.id",
      oracle: {
        type: "at_most_once_effect",
        effectId: "refunds",
        keyPath: "$.key",
        maximum: 1,
      },
      sourceNodeIds: ["http_refund"],
      requiresApproval: true,
    },
  ],
  scenarios: [
    {
      id: "duplicate_delivery",
      type: "duplicate_delivery",
      targetNodeId: "http_refund",
      faultPhase: "before_replayed_delivery",
      deliveries: 2,
      expectedInvariantIds: ["inv_refund_once"],
    },
    {
      id: "timeout_after_refund",
      type: "effect_succeeded_then_timeout",
      targetNodeId: "http_refund",
      faultPhase: "after_effect_before_response",
      deliveries: 2,
      expectedInvariantIds: ["inv_refund_once"],
    },
    {
      id: "rate_limit_before_refund",
      type: "failure_before_effect",
      targetNodeId: "http_refund",
      faultPhase: "before_effect",
      deliveries: 1,
      expectedInvariantIds: ["inv_refund_once"],
    },
    {
      id: "after_effect_replay",
      type: "after_effect_replay",
      targetNodeId: "http_refund",
      faultPhase: "after_node",
      deliveries: 2,
      expectedInvariantIds: ["inv_refund_once"],
    },
  ],
  unsupported: [],
  limitations: [
    "No production exactly-once claim",
    "Analysis applies only to the supported canonical subgraph",
    "Every invariant and repair requires human approval",
  ],
};

/**
 * Bind the seeded plan to the canonical graph instead of relying on a node
 * array position. Canonical n8n nodes are sorted by ID, so their indices are
 * intentionally not the editor order shown in the export.
 */
export function createCachedDemoPlan(input: {
  workflowId: string;
  canonicalGraph: { nodes: Array<{ id: string; parameters?: unknown }> };
}): RiskPlan {
  const effectIndex = input.canonicalGraph.nodes.findIndex(
    (node) => node.id === "http_refund",
  );
  if (effectIndex < 0) {
    throw new Error("The cached refund plan requires the http_refund node.");
  }

  const effectPath = `$.nodes[${effectIndex}].parameters`;
  return {
    ...structuredClone(CACHED_DEMO_PLAN),
    workflowId: input.workflowId,
    sideEffects: CACHED_DEMO_PLAN.sideEffects.map((sideEffect) => ({
      ...sideEffect,
      keyCandidates: sideEffect.keyCandidates.map((candidate) => ({
        ...candidate,
        evidencePaths: [`${effectPath}.body`],
      })),
      evidence: [
        {
          nodeId: sideEffect.nodeId,
          jsonPath: `${effectPath}.method`,
          observedValue: "POST",
          label: "observed",
        },
        {
          nodeId: sideEffect.nodeId,
          jsonPath: `${effectPath}.url`,
          observedValue: "mock://refunds",
          label: "observed",
        },
      ],
    })),
  };
}
