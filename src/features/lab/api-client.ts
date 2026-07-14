import type { Invariant, Scenario, SimulationArtifact } from "@/domain";
import type { RepairProposal } from "@/lib/codex/schemas";
import type { CompatibilityReport, CanonicalN8nWorkflow } from "@/lib/n8n";
import type { AnalyzerResult } from "@/lib/openai/schemas";
import type { SimulationSuite } from "@/lib/simulator";

export type ModelMode = "live" | "cached";

export type WorkflowResource = {
  id: string;
  name: string;
  sourceHash: string;
  canonical: CanonicalN8nWorkflow;
  compatibility: CompatibilityReport;
  credentialReferencesRemoved: number;
};

export type AnalysisResource = {
  id: string;
  workflowId: string;
  planVersion: number;
  planHash: string;
  result: AnalyzerResult;
  approvedPlan?: { planVersion: number; invariants: Invariant[]; approved: true };
  approvedAt?: string;
};

export type ExecutionResource = {
  id: string;
  analysisId: string;
  phase: "before" | "after";
  repairId?: string;
  workflowHash: string;
  fixtureHash: string;
  scenarios: Scenario[];
  suite: SimulationSuite;
};

export type RepairResource = {
  id: string;
  analysisId: string;
  proposal: RepairProposal;
  regressionValidation: {
    beforePassed: false;
    afterPassed: true;
    beforeSuiteHash: string;
    afterSuiteHash: string;
    sourceWorkflowHash: string;
    repairedWorkflowHash: string;
    fixtureHash: string;
    scenarioIds: string[];
    checks: Array<
      | "source_hash_bound"
      | "patch_structure_valid"
      | "credential_scan_clear"
      | "source_fixture_failed"
      | "repaired_fixture_passed"
    >;
  };
};

export type EvidenceReceipt = {
  schemaVersion: "1";
  claim: string;
  workflow: {
    id: string;
    sourceHash: string;
    name: string;
    coverage: CompatibilityReport["coverage"];
  };
  invariant: Invariant;
  before: Pick<ExecutionResource, "workflowHash" | "fixtureHash" | "scenarios"> &
    Pick<SimulationSuite, "passed" | "suiteHash" | "results">;
  after: Pick<ExecutionResource, "workflowHash" | "fixtureHash" | "scenarios"> &
    Pick<SimulationSuite, "passed" | "suiteHash" | "results">;
  repair: Pick<
    RepairProposal,
    "patch" | "manifest" | "explanation" | "regressionFixture" | "readme"
  > & { id: string; repairedWorkflowHash: string };
  limitations: string[];
  generatedAt: string;
};

export type ArtifactResource = {
  id: string;
  analysisId: string;
  repairId: string;
  sha256: string;
  receipt: EvidenceReceipt;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
};

export class RetryProofApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RetryProofApiError";
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // A non-JSON upstream failure still becomes a bounded public error.
    }
    throw new RetryProofApiError(
      body.error?.message ?? `RetryProof request failed (${response.status}).`,
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.requestId,
      body.error?.details,
    );
  }
  return (await response.json()) as T;
}

function mutationHeaders(csrfToken: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("x-csrf-token", csrfToken);
  return headers;
}

function jsonHeaders(csrfToken: string, extra?: HeadersInit): Headers {
  const headers = mutationHeaders(csrfToken, extra);
  headers.set("content-type", "application/json");
  return headers;
}

export async function establishSession(): Promise<string> {
  const body = await parse<{ session: { csrfToken: string } }>(
    await fetch("/api/v1/session", { credentials: "same-origin", cache: "no-store" }),
  );
  return body.session.csrfToken;
}

export async function createDemoWorkflow(csrfToken: string) {
  return parse<{
    session: { csrfToken: string };
    workflow: WorkflowResource;
    fixture: unknown;
  }>(
    await fetch("/api/v1/workflows", {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken),
      body: JSON.stringify({ demo: true }),
    }),
  );
}

export async function uploadWorkflow(csrfToken: string, workflow: File, fixture?: File) {
  const form = new FormData();
  form.set("workflow", workflow);
  if (fixture) form.set("fixture", fixture);
  return parse<{
    session: { csrfToken: string };
    workflow: WorkflowResource;
    fixture: unknown;
  }>(
    await fetch("/api/v1/workflows", {
      method: "POST",
      credentials: "same-origin",
      headers: mutationHeaders(csrfToken),
      body: form,
    }),
  );
}

export async function analyzeWorkflow(
  csrfToken: string,
  workflowId: string,
  mode: ModelMode,
) {
  return parse<{ analysis: AnalysisResource }>(
    await fetch(`/api/v1/workflows/${workflowId}/analyses`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken),
      body: JSON.stringify({ mode }),
    }),
  );
}

export async function approvePlan(
  csrfToken: string,
  analysis: AnalysisResource,
  invariants?: Invariant[],
) {
  return parse<{ analysis: AnalysisResource }>(
    await fetch(`/api/v1/analyses/${analysis.id}/plan`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken, { "if-match": analysis.planHash }),
      body: JSON.stringify({ approved: true, invariants }),
    }),
  );
}

export async function defineScenarios(
  csrfToken: string,
  analysisId: string,
  scenarioIds: string[],
) {
  return parse<{ scenarios: Scenario[] }>(
    await fetch(`/api/v1/analyses/${analysisId}/scenarios`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken),
      body: JSON.stringify({ scenarioIds }),
    }),
  );
}

export async function executeSuite(
  csrfToken: string,
  analysisId: string,
  phase: "before" | "after",
  seed = "demo-v1",
  repairId?: string,
) {
  return parse<{ execution: ExecutionResource }>(
    await fetch(`/api/v1/analyses/${analysisId}/executions`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken, {
        "idempotency-key": `${analysisId}-${phase}-${seed}`,
      }),
      body: JSON.stringify({ phase, seed, ...(repairId ? { repairId } : {}) }),
    }),
  );
}

export async function createRepair(
  csrfToken: string,
  analysisId: string,
  mode: ModelMode,
) {
  return parse<{ repair: RepairResource }>(
    await fetch(`/api/v1/analyses/${analysisId}/repairs`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken),
      body: JSON.stringify({ mode }),
    }),
  );
}

export async function recheckRepair(
  csrfToken: string,
  repairId: string,
  seed = "demo-v1",
) {
  return parse<{ execution: ExecutionResource; artifact: ArtifactResource }>(
    await fetch(`/api/v1/repairs/${repairId}/recheck`, {
      method: "POST",
      credentials: "same-origin",
      headers: jsonHeaders(csrfToken),
      body: JSON.stringify({ seed }),
    }),
  );
}

export async function deleteSession(csrfToken: string): Promise<void> {
  await parse<{ deleted: true }>(
    await fetch("/api/v1/session", {
      method: "DELETE",
      credentials: "same-origin",
      headers: mutationHeaders(csrfToken),
    }),
  );
}

export function firstFailingArtifact(execution: ExecutionResource | null): SimulationArtifact | null {
  return execution?.suite.results.find((result) => !result.passed) ?? null;
}
