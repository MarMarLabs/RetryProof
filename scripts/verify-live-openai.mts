import { DEMO_FIXTURE, DEMO_N8N_WORKFLOW } from "../src/lib/lab/demo.ts";
import { ingestN8nWorkflow, listSupportedNodeContracts } from "../src/lib/n8n/index.ts";
import { OpenAIWorkflowAnalyzer } from "../src/lib/openai/analyzer.ts";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for the live GPT-5.6 verification.");
}

const imported = ingestN8nWorkflow(JSON.stringify(DEMO_N8N_WORKFLOW));
const canonicalGraph = JSON.parse(JSON.stringify(imported.canonicalWorkflow)) as {
  nodes: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
};
const result = await new OpenAIWorkflowAnalyzer().analyze({
  workflowId: "live_analysis_probe",
  canonicalGraph,
  fixtureShape: DEMO_FIXTURE.input,
  supportedNodeContracts: listSupportedNodeContracts(),
  safetyIdentifier: imported.sourceHash,
  mode: "live",
});

process.stdout.write(
  `${JSON.stringify(
    {
      mode: result.provenance.mode,
      model: result.provenance.model,
      requestIdPresent: Boolean(result.provenance.requestId),
      sideEffects: result.plan.sideEffects.length,
      invariants: result.plan.invariants.length,
      scenarios: result.plan.scenarios.length,
      groundedNodeIds: [
        ...new Set(
          result.plan.sideEffects.flatMap((effect) => [
            effect.nodeId,
            ...effect.evidence.map((evidence) => evidence.nodeId),
          ]),
        ),
      ],
      inputTokens: result.provenance.inputTokens,
      outputTokens: result.provenance.outputTokens,
    },
    null,
    2,
  )}\n`,
);
