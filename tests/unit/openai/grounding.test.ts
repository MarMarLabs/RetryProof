import { describe, expect, it } from "vitest";

import { createCachedDemoPlan } from "@/lib/openai/cached-plan";
import { GroundingError, validatePlanGrounding } from "@/lib/openai/grounding";

const graph = {
  nodes: [
    {
      id: "http_refund",
      parameters: {
        method: "POST",
        url: "mock://refunds",
        body: { event_id: "={{ $json.event.id }}" },
      },
    },
  ],
};

describe("model evidence grounding", () => {
  it("accepts exact paths rooted at the canonical graph or supplied fixture", () => {
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph: graph });
    plan.sideEffects[0]!.evidence[0]!.jsonPath =
      "$.canonicalGraph.nodes[0].parameters.method";
    plan.sideEffects[0]!.keyCandidates[0]!.evidencePaths = [
      "$.fixtureShape.input.event.id",
    ];

    expect(
      validatePlanGrounding(plan, graph, { input: { event: { id: "evt_1" } } }),
    ).toBe(plan);
  });

  it("rejects a path that does not exist in either supplied evidence root", () => {
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph: graph });
    plan.sideEffects[0]!.evidence[0]!.jsonPath = "$.fixtureShape.secrets.apiKey";

    expect(() => validatePlanGrounding(plan, graph, { input: {} })).toThrow(
      GroundingError,
    );
  });

  it("rejects prototype-chain evidence paths", () => {
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph: graph });
    plan.sideEffects[0]!.evidence[0]!.jsonPath = "$.__proto__.toString";
    expect(() => validatePlanGrounding(plan, graph, { input: {} })).toThrow(
      GroundingError,
    );
  });

  it("binds invariant effect IDs to the cited HTTP node", () => {
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph: graph });
    plan.invariants[0]!.oracle.effectId = "ghost";
    expect(() => validatePlanGrounding(plan, graph, { input: {} })).toThrow(
      GroundingError,
    );
  });

  it("binds graph evidence paths to the node they claim to describe", () => {
    const twoNodeGraph = {
      nodes: [
        { id: "attacker_decoy", parameters: { method: "DELETE" } },
        graph.nodes[0]!,
      ],
    };
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph: twoNodeGraph });
    plan.sideEffects[0]!.evidence[0]!.nodeId = "http_refund";
    plan.sideEffects[0]!.evidence[0]!.jsonPath = "$.nodes[0].parameters.method";

    expect(() => validatePlanGrounding(plan, twoNodeGraph, { input: {} })).toThrow(
      GroundingError,
    );
  });
});
