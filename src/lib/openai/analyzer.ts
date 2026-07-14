import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { performance } from "node:perf_hooks";
import { createCachedDemoPlan } from "./cached-plan";
import { validatePlanGrounding } from "./grounding";
import { ANALYZER_PROMPT_VERSION, ANALYZER_SYSTEM_PROMPT, buildAnalyzerInput } from "./prompts";
import { AnalyzerResultSchema, RiskPlanSchema, type AnalyzerResult } from "./schemas";

export type AnalyzeWorkflowInput = {
  workflowId: string;
  canonicalGraph: { nodes: Array<{ id: string; [key: string]: unknown }>; [key: string]: unknown };
  fixtureShape: unknown;
  supportedNodeContracts: unknown;
  invariantHint?: string;
  safetyIdentifier: string;
  mode?: "live" | "cached";
};

export interface WorkflowAnalyzer {
  analyze(input: AnalyzeWorkflowInput): Promise<AnalyzerResult>;
}

export class OpenAIWorkflowAnalyzer implements WorkflowAnalyzer {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    organizationId?: string;
    projectId?: string;
  }) {
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
      organization: options?.organizationId ?? process.env.OPENAI_ORGANIZATION_ID,
      project: options?.projectId ?? process.env.OPENAI_PROJECT_ID,
      timeout: 60_000,
      maxRetries: 1,
    });
    this.model = options?.model ?? process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5.6-sol";
  }

  async analyze(input: AnalyzeWorkflowInput): Promise<AnalyzerResult> {
    const mode = input.mode ?? (process.env.DEMO_MODEL_MODE === "live" ? "live" : "cached");
    if (mode === "cached") {
      const plan = createCachedDemoPlan({
        workflowId: input.workflowId,
        canonicalGraph: input.canonicalGraph,
      });
      validatePlanGrounding(plan, input.canonicalGraph, input.fixtureShape);
      return AnalyzerResultSchema.parse({
        plan,
        provenance: {
          mode: "cached",
          model: this.model,
          promptVersion: ANALYZER_PROMPT_VERSION,
          latencyMs: 0,
        },
      });
    }

    const started = performance.now();
    const response = await this.client.responses.parse({
      model: this.model,
      max_output_tokens: 4_000,
      store: false,
      safety_identifier: input.safetyIdentifier,
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: ANALYZER_SYSTEM_PROMPT },
        { role: "user", content: buildAnalyzerInput(input) },
      ],
      text: {
        format: zodTextFormat(RiskPlanSchema, "retryproof_risk_plan"),
      },
    });

    if (!response.output_parsed) throw new Error("GPT-5.6 returned no structured risk plan.");
    const plan = RiskPlanSchema.parse(response.output_parsed);
    validatePlanGrounding(plan, input.canonicalGraph, input.fixtureShape);

    return AnalyzerResultSchema.parse({
      plan,
      provenance: {
        mode: "live",
        model: this.model,
        requestId: response.id,
        promptVersion: ANALYZER_PROMPT_VERSION,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    });
  }
}

export function createWorkflowAnalyzer(): WorkflowAnalyzer {
  return new OpenAIWorkflowAnalyzer();
}
