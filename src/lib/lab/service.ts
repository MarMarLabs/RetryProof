import { createHash, randomUUID } from "node:crypto";

import { invariantSchema, type Invariant, type Scenario } from "@/domain";
import { createRepairAgent, liveCodexRepairAllowed } from "@/lib/codex/repair-agent";
import { createRegressionFixture } from "@/lib/codex/cached-repair";
import { PatchValidationError, validateRepairProposal } from "@/lib/codex/patch-validator";
import { ingestN8nWorkflow, listSupportedNodeContracts } from "@/lib/n8n";
import { createWorkflowAnalyzer } from "@/lib/openai/analyzer";
import { CACHED_DEMO_PLAN } from "@/lib/openai/cached-plan";
import { ANALYZER_PROMPT_VERSION } from "@/lib/openai/prompts";
import { AnalyzerResultSchema } from "@/lib/openai/schemas";
import {
  enforceGlobalRateLimit,
  enforceRateLimit,
  getStore,
  requireOwnedResource,
} from "@/lib/platform";
import { deterministicHash, runSuite } from "@/lib/simulator";

import {
  DEMO_FIXTURE,
  DEMO_N8N_WORKFLOW,
} from "./demo";
import { getLabRepository, type LabRepository } from "./repository";
import { sanitizeFixture } from "./security";
import { LabHttpError } from "./session";
import { fixtureForWorkflow, toSimulatorWorkflow } from "./translator";
import {
  LAB_TTL_MS,
  publicAnalysis,
  publicRepair,
  publicWorkflow,
  type AnalysisRecord,
  type ApprovedPlan,
  type ArtifactRecord,
  type EvidenceReceipt,
  type ExecutionRecord,
  type PublicAnalysis,
  type PublicRepair,
  type PublicWorkflow,
  type RepairRecord,
  type ScenarioSetRecord,
  type WorkflowRecord,
} from "./types";

function timestamps() {
  const createdAt = new Date();
  return {
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + LAB_TTL_MS).toISOString(),
  };
}

function own<T extends { id: string; sessionId: string }>(sessionId: string, record: T | null): T {
  return requireOwnedResource(sessionId, record);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeEtag(value: string | null): string | null {
  return value?.replace(/^W\//, "").replace(/^"|"$/g, "") ?? null;
}

function scenarioFromProposal(
  proposal: AnalysisRecord["result"]["plan"]["scenarios"][number],
): Scenario {
  if (proposal.type === "failure_before_effect") {
    return {
      schemaVersion: "1",
      id: proposal.id,
      type: "rate_limited_then_retry",
      targetNodeId: proposal.targetNodeId,
      faultPhase: "before_effect",
      deliveries: Math.max(2, proposal.deliveries),
      expectedInvariantIds: proposal.expectedInvariantIds,
    };
  }
  if (proposal.type === "after_effect_replay") {
    return {
      schemaVersion: "1",
      id: proposal.id,
      type: "partial_failure_then_retry",
      targetNodeId: proposal.targetNodeId,
      faultPhase: "after_node",
      deliveries: Math.max(2, proposal.deliveries),
      expectedInvariantIds: proposal.expectedInvariantIds,
    };
  }
  if (proposal.type === "duplicate_delivery") {
    return {
      schemaVersion: "1",
      id: proposal.id,
      type: "duplicate_delivery",
      targetNodeId: proposal.targetNodeId,
      faultPhase: "before_replayed_delivery",
      deliveries: Math.max(2, proposal.deliveries),
      expectedInvariantIds: proposal.expectedInvariantIds,
    };
  }
  return {
    schemaVersion: "1",
    id: proposal.id,
    type: "effect_succeeded_then_timeout",
    targetNodeId: proposal.targetNodeId,
    faultPhase: "after_effect_before_response",
    deliveries: Math.max(2, proposal.deliveries),
    expectedInvariantIds: proposal.expectedInvariantIds,
  };
}

function approvedInvariantFromProposal(
  proposal: AnalysisRecord["result"]["plan"]["invariants"][number],
): Invariant {
  return invariantSchema.parse({
    schemaVersion: "1",
    id: proposal.id,
    statement: proposal.statement,
    oracle: proposal.oracle,
    sourceNodeIds: proposal.sourceNodeIds,
    approved: true,
  });
}

export class LabService {
  constructor(private readonly repository: LabRepository = getLabRepository()) {}

  async createWorkflow(input: {
    sessionId: string;
    rawWorkflow?: string | Uint8Array;
    fixture?: unknown;
    demo?: boolean;
  }): Promise<{ workflow: PublicWorkflow; fixture: unknown }> {
    await enforceRateLimit(getStore(), input.sessionId, "imports");
    const raw = input.demo
      ? JSON.stringify(DEMO_N8N_WORKFLOW)
      : input.rawWorkflow;
    if (!raw) throw new LabHttpError("WORKFLOW_REQUIRED", "A workflow file is required.", 400);
    const ingestion = ingestN8nWorkflow(raw);
    const fixtureInput = input.demo
      ? DEMO_FIXTURE
      : sanitizeFixture(input.fixture ?? { event: { id: "evt_example_1" } });
    const id = randomUUID();
    const fixture = input.demo
      ? DEMO_FIXTURE
      : fixtureForWorkflow(ingestion.canonicalWorkflow, fixtureInput, `fixture_${id}`);
    let simulatorWorkflow;
    if (ingestion.compatibility.canExecute) {
      simulatorWorkflow = toSimulatorWorkflow(ingestion.sanitizedWorkflow, id);
    }
    const record: WorkflowRecord = {
      kind: "workflow",
      id,
      sessionId: input.sessionId,
      name: ingestion.canonicalWorkflow.name,
      sourceHash: ingestion.sourceHash,
      sanitizedWorkflow: ingestion.sanitizedWorkflow,
      canonical: ingestion.canonicalWorkflow,
      compatibility: ingestion.compatibility,
      fixture,
      simulatorWorkflow,
      credentialReferencesRemoved: ingestion.credentialReferencesRemoved,
      demoSeed: input.demo === true,
      ...timestamps(),
    };
    await this.repository.put(record);
    return { workflow: publicWorkflow(record), fixture };
  }

  async analyzeWorkflow(input: {
    sessionId: string;
    workflowId: string;
    mode?: "live" | "cached";
    invariantHint?: string;
  }): Promise<PublicAnalysis> {
    await enforceRateLimit(getStore(), input.sessionId, "analyses");
    const workflow = own(
      input.sessionId,
      await this.repository.get<WorkflowRecord>("workflow", input.workflowId),
    );
    const analyzerInput = {
      workflowId: workflow.id,
      canonicalGraph: workflow.canonical as unknown as {
        nodes: Array<{ id: string; [key: string]: unknown }>;
        [key: string]: unknown;
      },
      fixtureShape: workflow.fixture,
      supportedNodeContracts: listSupportedNodeContracts(),
      invariantHint: input.invariantHint,
      safetyIdentifier: sha256(input.sessionId),
      mode: input.mode ?? "cached" as const,
    };
    if (analyzerInput.mode === "cached" && !workflow.demoSeed) {
      throw new LabHttpError(
        "CACHED_DEMO_ONLY",
        "Cached analysis is available only for the synthetic refund demo. Use live analysis for uploaded workflows.",
        422,
      );
    }
    if (analyzerInput.mode === "live") {
      await enforceGlobalRateLimit(getStore(), "liveAnalyses");
    }
    let result;
    try {
      result = analyzerInput.mode === "cached"
        ? AnalyzerResultSchema.parse({
          plan: { ...CACHED_DEMO_PLAN, workflowId: workflow.id },
          provenance: {
            mode: "cached",
            model: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-5.6-sol",
            promptVersion: ANALYZER_PROMPT_VERSION,
            latencyMs: 0,
          },
          })
        : await createWorkflowAnalyzer().analyze(analyzerInput);
    } catch (error) {
      if (error instanceof LabHttpError) throw error;
      throw new LabHttpError(
        "OPENAI_ANALYSIS_UNAVAILABLE",
        "GPT-5.6 analysis is temporarily unavailable. The sanitized import was preserved.",
        503,
      );
    }
    const record: AnalysisRecord = {
      kind: "analysis",
      id: randomUUID(),
      sessionId: input.sessionId,
      workflowId: workflow.id,
      planVersion: 1,
      planHash: deterministicHash(result.plan),
      result,
      ...timestamps(),
    };
    await this.repository.put(record);
    return publicAnalysis(record);
  }

  async approvePlan(input: {
    sessionId: string;
    analysisId: string;
    ifMatch: string | null;
    approvedPlan?: Partial<ApprovedPlan> & { approved?: boolean };
  }): Promise<PublicAnalysis> {
    const analysis = own(
      input.sessionId,
      await this.repository.get<AnalysisRecord>("analysis", input.analysisId),
    );
    if (!input.ifMatch) {
      throw new LabHttpError("PRECONDITION_REQUIRED", "If-Match is required to approve a plan.", 428);
    }
    if (normalizeEtag(input.ifMatch) !== analysis.planHash) {
      throw new LabHttpError("STALE_PLAN", "The plan changed. Review the latest plan before approval.", 409, {
        currentPlanHash: analysis.planHash,
      });
    }
    if (input.approvedPlan?.approved !== true) {
      throw new LabHttpError("APPROVAL_REQUIRED", "The plan must be explicitly approved.", 422);
    }
    if (
      input.approvedPlan.planVersion !== undefined &&
      input.approvedPlan.planVersion !== analysis.planVersion
    ) {
      throw new LabHttpError("STALE_PLAN", "The submitted plan version is stale.", 409, {
        currentPlanVersion: analysis.planVersion,
      });
    }
    const invariants = input.approvedPlan.invariants?.length
      ? input.approvedPlan.invariants.map((value) => invariantSchema.parse({ ...value, approved: true }))
      : analysis.result.plan.invariants.map(approvedInvariantFromProposal);
    const workflow = own(
      input.sessionId,
      await this.repository.get<WorkflowRecord>("workflow", analysis.workflowId),
    );
    const knownNodeIds = new Set(workflow.canonical.nodes.map((node) => node.id));
    const simulatorNodes = new Map(
      workflow.simulatorWorkflow?.nodes.map((node) => [node.id, node]) ?? [],
    );
    for (const invariant of invariants) {
      const unknown = invariant.sourceNodeIds.find((nodeId) => !knownNodeIds.has(nodeId));
      if (unknown) {
        throw new LabHttpError("INVARIANT_NOT_GROUNDED", "An invariant cites an unknown workflow node.", 422, {
          nodeId: unknown,
        });
      }
      const boundEffect = invariant.sourceNodeIds.some((nodeId) => {
        const node = simulatorNodes.get(nodeId);
        return node?.type === "http_request" && node.effect?.id === invariant.oracle.effectId;
      });
      if (!boundEffect || invariant.oracle.keyPath !== "$.key") {
        throw new LabHttpError(
          "INVARIANT_NOT_GROUNDED",
          "The invariant must count the bound effect key of a cited HTTP node.",
          422,
          { invariantId: invariant.id },
        );
      }
    }
    const approvedPlan: ApprovedPlan = {
      planVersion: analysis.planVersion,
      invariants,
      approved: true,
    };
    const updated: AnalysisRecord = {
      ...analysis,
      approvedPlan,
      approvedAt: new Date().toISOString(),
    };
    await this.repository.put(updated);
    return publicAnalysis(updated);
  }

  async defineScenarios(input: {
    sessionId: string;
    analysisId: string;
    scenarioIds?: string[];
  }): Promise<Scenario[]> {
    const analysis = await this.requireApprovedAnalysis(input.sessionId, input.analysisId);
    const wanted = input.scenarioIds ? new Set(input.scenarioIds) : null;
    const scenarios = analysis.result.plan.scenarios
      .filter((proposal) => !wanted || wanted.has(proposal.id))
      .map(scenarioFromProposal);
    if (scenarios.length === 0) {
      throw new LabHttpError("SCENARIOS_REQUIRED", "Select at least one supported scenario.", 422);
    }
    const record: ScenarioSetRecord = {
      kind: "scenario_set",
      id: randomUUID(),
      sessionId: input.sessionId,
      analysisId: analysis.id,
      scenarios,
      ...timestamps(),
    };
    await this.repository.put(record);
    return scenarios;
  }

  async execute(input: {
    sessionId: string;
    analysisId: string;
    phase: "before" | "after";
    repairId?: string;
    seed?: string;
  }): Promise<ExecutionRecord> {
    await enforceRateLimit(getStore(), input.sessionId, "executions");
    const analysis = await this.requireApprovedAnalysis(input.sessionId, input.analysisId);
    const workflow = own(
      input.sessionId,
      await this.repository.get<WorkflowRecord>("workflow", analysis.workflowId),
    );
    const scenarioSets = await this.repository.findByParent<ScenarioSetRecord>(
      "scenario_set",
      input.sessionId,
      analysis.id,
    );
    const scenarios = scenarioSets.at(-1)?.scenarios ?? analysis.result.plan.scenarios.map(scenarioFromProposal);
    let simulatorWorkflow = workflow.simulatorWorkflow;
    if (input.phase === "after") {
      if (!input.repairId) {
        throw new LabHttpError("REPAIR_REQUIRED", "Create and validate a repair before the after run.", 409);
      }
      const repair = own(
        input.sessionId,
        await this.repository.get<RepairRecord>("repair", input.repairId),
      );
      if (repair.analysisId !== analysis.id) {
        throw new LabHttpError(
          "REPAIR_ANALYSIS_MISMATCH",
          "The selected repair does not belong to this analysis.",
          409,
        );
      }
      simulatorWorkflow = repair.repairedWorkflow;
    }
    if (!simulatorWorkflow || !workflow.compatibility.canExecute) {
      throw new LabHttpError(
        "UNSUPPORTED_NODE_ON_PATH",
        "The tested path contains a node outside the declared simulator coverage.",
        422,
        { blockingNodeIds: workflow.compatibility.blockingNodeIds },
      );
    }
    const suite = runSuite({
      workflow: simulatorWorkflow,
      fixture: workflow.fixture,
      invariants: analysis.approvedPlan!.invariants,
      scenarios,
      seed: input.seed ?? "demo-v1",
    });
    const record: ExecutionRecord = {
      kind: "execution",
      id: randomUUID(),
      sessionId: input.sessionId,
      analysisId: analysis.id,
      phase: input.phase,
      ...(input.repairId ? { repairId: input.repairId } : {}),
      workflowHash: deterministicHash(simulatorWorkflow),
      fixtureHash: deterministicHash(workflow.fixture),
      scenarios,
      suite,
      ...timestamps(),
    };
    await this.repository.put(record);
    return record;
  }

  async createRepair(input: {
    sessionId: string;
    analysisId: string;
    mode?: "live" | "cached";
  }): Promise<PublicRepair> {
    await enforceRateLimit(getStore(), input.sessionId, "repairs");
    const analysis = await this.requireApprovedAnalysis(input.sessionId, input.analysisId);
    const workflow = own(
      input.sessionId,
      await this.repository.get<WorkflowRecord>("workflow", analysis.workflowId),
    );
    const executions = await this.repository.findByParent<ExecutionRecord>(
      "execution",
      input.sessionId,
      analysis.id,
    );
    const failing = executions.filter((execution) => execution.phase === "before" && !execution.suite.passed).at(-1);
    if (!failing) {
      throw new LabHttpError("FAILING_TRACE_REQUIRED", "Run a failing before suite before requesting repair.", 409);
    }
    const invariant = analysis.approvedPlan!.invariants[0];
    const scenarios = failing.scenarios;
    const mode = input.mode ?? "cached";
    if (mode === "cached" && !workflow.demoSeed) {
      throw new LabHttpError(
        "CACHED_DEMO_ONLY",
        "Cached repair is available only for the synthetic refund demo. Uploaded workflows require an explicitly enabled trusted-local live repair.",
        422,
      );
    }
    if (mode === "live") {
      if (!liveCodexRepairAllowed()) {
        throw new LabHttpError(
          "LIVE_CODEX_LOCAL_ONLY",
          "Live Codex repair is available only in an explicitly enabled trusted-local environment.",
          422,
        );
      }
      await enforceGlobalRateLimit(getStore(), "liveRepairs");
    }
    let proposal;
    try {
      proposal = await createRepairAgent().createRepair({
        sourceHash: workflow.sourceHash,
        workflow: workflow.sanitizedWorkflow as unknown as Record<string, unknown>,
        fixture: workflow.fixture as unknown as Record<string, unknown>,
        invariant,
        scenarios,
        failingTrace: failing.suite,
        mode,
      });
    } catch {
      throw new LabHttpError(
        "CODEX_REPAIR_UNAVAILABLE",
        "Codex repair is temporarily unavailable. The failing trace remains available.",
        503,
      );
    }
    let validated;
    const expectedRegressionFixture = createRegressionFixture({
      fixture: workflow.fixture,
      scenarios,
      invariant,
      failingScenarioIds: failing.suite.results
        .filter((result) => !result.passed)
        .map((result) => result.scenarioId),
      seed: failing.suite.seed,
    });
    try {
      validated = validateRepairProposal({
        proposal,
        sourceWorkflow: workflow.sanitizedWorkflow as unknown as Record<string, unknown>,
        sourceHash: workflow.sourceHash,
        approvedInvariantId: invariant.id,
        effectNodeIds: invariant.sourceNodeIds,
        expectedRegressionFixture,
      });
    } catch (error) {
      if (error instanceof PatchValidationError) {
        throw new LabHttpError(
          "INVALID_REPAIR_PATCH",
          "The repair did not pass deterministic structural validation.",
          422,
          { issues: error.issues },
        );
      }
      throw error;
    }
    const patchedIngestion = ingestN8nWorkflow(JSON.stringify(validated.patchedWorkflow));
    const repairedWorkflow = toSimulatorWorkflow(
      patchedIngestion.sanitizedWorkflow,
      workflow.id,
    );
    if (!workflow.simulatorWorkflow) {
      throw new LabHttpError(
        "UNSUPPORTED_NODE_ON_PATH",
        "The tested path contains a node outside the declared simulator coverage.",
        422,
      );
    }
    const regressionBefore = runSuite({
      workflow: workflow.simulatorWorkflow,
      fixture: proposal.regressionFixture.fixture,
      invariants: [proposal.regressionFixture.invariant],
      scenarios: proposal.regressionFixture.scenarios,
      seed: proposal.regressionFixture.seed,
    });
    const regressionAfter = runSuite({
      workflow: repairedWorkflow,
      fixture: proposal.regressionFixture.fixture,
      invariants: [proposal.regressionFixture.invariant],
      scenarios: proposal.regressionFixture.scenarios,
      seed: proposal.regressionFixture.seed,
    });
    if (regressionBefore.passed || !regressionAfter.passed) {
      throw new LabHttpError(
        "INVALID_REPAIR_REGRESSION",
        "The regression fixture must fail against the source and pass against the repaired workflow.",
        422,
      );
    }
    const regressionValidation = {
      beforePassed: false as const,
      afterPassed: true as const,
      beforeSuiteHash: regressionBefore.suiteHash,
      afterSuiteHash: regressionAfter.suiteHash,
      sourceWorkflowHash: deterministicHash(workflow.simulatorWorkflow),
      repairedWorkflowHash: deterministicHash(repairedWorkflow),
      fixtureHash: deterministicHash(proposal.regressionFixture.fixture),
      scenarioIds: proposal.regressionFixture.scenarios.map((scenario) => scenario.id),
      checks: [
        "source_hash_bound" as const,
        "patch_structure_valid" as const,
        "credential_scan_clear" as const,
        "source_fixture_failed" as const,
        "repaired_fixture_passed" as const,
      ],
    };
    const record: RepairRecord = {
      kind: "repair",
      id: randomUUID(),
      sessionId: input.sessionId,
      analysisId: analysis.id,
      proposal,
      repairedWorkflow,
      regressionValidation,
      ...timestamps(),
    };
    await this.repository.put(record);
    return publicRepair(record);
  }

  async recheck(input: {
    sessionId: string;
    repairId: string;
    seed?: string;
  }): Promise<{ execution: ExecutionRecord; artifact: ArtifactRecord }> {
    const repair = own(
      input.sessionId,
      await this.repository.get<RepairRecord>("repair", input.repairId),
    );
    const execution = await this.execute({
      sessionId: input.sessionId,
      analysisId: repair.analysisId,
      phase: "after",
      repairId: repair.id,
      seed: input.seed,
    });
    if (!execution.suite.passed) {
      throw new LabHttpError(
        "REPAIR_DID_NOT_VERIFY",
        "The repair did not satisfy every approved invariant under the selected scenarios.",
        422,
      );
    }
    const analysis = await this.requireApprovedAnalysis(input.sessionId, repair.analysisId);
    const workflow = own(
      input.sessionId,
      await this.repository.get<WorkflowRecord>("workflow", analysis.workflowId),
    );
    const executions = await this.repository.findByParent<ExecutionRecord>(
      "execution",
      input.sessionId,
      analysis.id,
    );
    const before = executions.filter((item) => item.phase === "before" && !item.suite.passed).at(-1);
    if (!before) throw new LabHttpError("FAILING_TRACE_REQUIRED", "The red evidence is unavailable.", 409);
    const receipt: EvidenceReceipt = {
      schemaVersion: "1",
      claim: "The approved invariant passed the declared deterministic fault scenarios after repair.",
      workflow: {
        id: workflow.id,
        sourceHash: workflow.sourceHash,
        name: workflow.name,
        coverage: workflow.compatibility.coverage,
      },
      invariant: analysis.approvedPlan!.invariants[0],
      before: {
        passed: before.suite.passed,
        suiteHash: before.suite.suiteHash,
        results: before.suite.results,
        workflowHash: before.workflowHash,
        fixtureHash: before.fixtureHash,
        scenarios: before.scenarios,
      },
      after: {
        passed: execution.suite.passed,
        suiteHash: execution.suite.suiteHash,
        results: execution.suite.results,
        workflowHash: execution.workflowHash,
        fixtureHash: execution.fixtureHash,
        scenarios: execution.scenarios,
      },
      repair: {
        id: repair.id,
        repairedWorkflowHash: deterministicHash(repair.repairedWorkflow),
        patch: repair.proposal.patch,
        manifest: repair.proposal.manifest,
        explanation: repair.proposal.explanation,
        regressionFixture: repair.proposal.regressionFixture,
        readme: repair.proposal.readme,
      },
      limitations: [
        "Verdicts apply only to the user-approved invariant and declared deterministic fault model.",
        "RetryProof does not claim exactly-once execution or production safety.",
        "No real network, credentials, workflow code, SQL, or production side effect was executed.",
      ],
      generatedAt: new Date().toISOString(),
    };
    const artifact: ArtifactRecord = {
      kind: "artifact",
      id: randomUUID(),
      sessionId: input.sessionId,
      analysisId: analysis.id,
      repairId: repair.id,
      receipt,
      sha256: deterministicHash(receipt),
      ...timestamps(),
    };
    await this.repository.put(artifact);
    return { execution, artifact };
  }

  async getArtifact(sessionId: string, artifactId: string): Promise<ArtifactRecord> {
    return own(sessionId, await this.repository.get<ArtifactRecord>("artifact", artifactId));
  }

  async getAnalysis(sessionId: string, analysisId: string): Promise<AnalysisRecord> {
    return own(sessionId, await this.repository.get<AnalysisRecord>("analysis", analysisId));
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.repository.deleteSession(sessionId);
    await getStore().deleteSession(sessionId);
  }

  private async requireApprovedAnalysis(sessionId: string, analysisId: string): Promise<AnalysisRecord> {
    const analysis = own(
      sessionId,
      await this.repository.get<AnalysisRecord>("analysis", analysisId),
    );
    if (!analysis.approvedPlan || !analysis.approvedAt) {
      throw new LabHttpError("PLAN_APPROVAL_REQUIRED", "Approve the invariant before execution.", 409);
    }
    return analysis;
  }
}

export function createLabService(repository?: LabRepository): LabService {
  return new LabService(repository);
}
