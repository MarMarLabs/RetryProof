import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAIWorkflowAnalyzer } from "@/lib/openai/analyzer";
import { createCachedDemoPlan } from "@/lib/openai/cached-plan";
import { RiskPlanSchema } from "@/lib/openai/schemas";

const canonicalGraph = {
  schemaVersion: "1",
  nodes: [
    { id: "audit", parameters: {} },
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

describe("OpenAIWorkflowAnalyzer cached mode", () => {
  afterEach(() => {
    delete process.env.DEMO_MODEL_MODE;
    delete process.env.OPENAI_ORGANIZATION_ID;
    delete process.env.OPENAI_PROJECT_ID;
  });

  it("grounds the seeded analysis against the actual canonical node index", async () => {
    const analyzer = new OpenAIWorkflowAnalyzer({ apiKey: "not-used" });
    const result = await analyzer.analyze({
      workflowId: "wf_test",
      canonicalGraph,
      fixtureShape: { event: { id: "string" } },
      supportedNodeContracts: [],
      safetyIdentifier: "session-test",
      mode: "cached",
    });

    expect(result.provenance.mode).toBe("cached");
    expect(result.plan.workflowId).toBe("wf_test");
    expect(result.plan.sideEffects[0]?.evidence[0]?.jsonPath).toBe(
      "$.nodes[1].parameters.method",
    );
  });

  it("fails closed when the seeded effect node is absent", async () => {
    const analyzer = new OpenAIWorkflowAnalyzer({ apiKey: "not-used" });
    await expect(
      analyzer.analyze({
        workflowId: "wf_test",
        canonicalGraph: { nodes: [{ id: "read_only", parameters: {} }] },
        fixtureShape: {},
        supportedNodeContracts: [],
        safetyIdentifier: "session-test",
        mode: "cached",
      }),
    ).rejects.toThrow("requires the http_refund node");
  });

  it("honors an explicit live request when the deployment default is cached", async () => {
    process.env.DEMO_MODEL_MODE = "cached";
    const analyzer = new OpenAIWorkflowAnalyzer({ apiKey: "not-used" });
    const parse = vi.fn().mockResolvedValue({
      id: "resp_live_test",
      output_parsed: createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph }),
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    Reflect.set(analyzer, "client", { responses: { parse } });

    const result = await analyzer.analyze({
      workflowId: "wf_test",
      canonicalGraph,
      fixtureShape: { event: { id: "string" } },
      supportedNodeContracts: [],
      safetyIdentifier: "session-test",
      mode: "live",
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ max_output_tokens: 4_000 }));
    expect(result.provenance.mode).toBe("live");
    expect(result.provenance.requestId).toBe("resp_live_test");
  });

  it("routes live analysis through the configured organization and project", () => {
    process.env.OPENAI_ORGANIZATION_ID = "org_test";
    process.env.OPENAI_PROJECT_ID = "proj_test";

    const analyzer = new OpenAIWorkflowAnalyzer({ apiKey: "not-used" });
    const client = Reflect.get(analyzer, "client") as {
      organization?: string;
      project?: string;
    };

    expect(client.organization).toBe("org_test");
    expect(client.project).toBe("proj_test");
    expect(Reflect.get(client, "timeout")).toBe(60_000);
    expect(Reflect.get(client, "maxRetries")).toBe(1);
  });

  it("bounds every unsupported-plan branch", () => {
    const plan = createCachedDemoPlan({ workflowId: "wf_test", canonicalGraph });
    plan.unsupported = Array.from({ length: 13 }, (_, index) => ({
      nodeId: `node-${index}`,
      reason: "unsupported",
    }));
    expect(RiskPlanSchema.safeParse(plan).success).toBe(false);
  });
});
