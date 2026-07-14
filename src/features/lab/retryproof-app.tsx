"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { ContractStep } from "@/components/contract/contract-step";
import { EvidenceStep } from "@/components/evidence/evidence-step";
import { FaultStep } from "@/components/fault-lab/fault-step";
import { ImportStep } from "@/components/import/import-step";
import { RepairStep } from "@/components/repair/repair-step";
import { AppShell } from "@/components/shell/app-shell";
import type { Invariant, Scenario } from "@/domain";

import {
  analyzeWorkflow,
  approvePlan,
  createDemoWorkflow,
  createRepair,
  defineScenarios,
  deleteSession,
  establishSession,
  executeSuite,
  recheckRepair,
  RetryProofApiError,
  uploadWorkflow,
  type AnalysisResource,
  type ArtifactResource,
  type ExecutionResource,
  type ModelMode,
  type RepairResource,
  type WorkflowResource,
} from "./api-client";
import type { LabStage, WorkflowNodeView } from "./types";

type LabState = {
  stage: LabStage;
  csrfToken: string | null;
  workflow: WorkflowResource | null;
  fixture: unknown;
  analysis: AnalysisResource | null;
  scenarios: Scenario[];
  beforeExecution: ExecutionResource | null;
  repair: RepairResource | null;
  afterExecution: ExecutionResource | null;
  artifact: ArtifactResource | null;
  busy: string | null;
  notice: string | null;
  error: string | null;
};

type Action =
  | { type: "session"; csrfToken: string }
  | { type: "busy"; label: string }
  | { type: "imported"; workflow: WorkflowResource; fixture: unknown; csrfToken?: string }
  | { type: "analyzed"; analysis: AnalysisResource; notice: string }
  | { type: "approved"; analysis: AnalysisResource; scenarios: Scenario[] }
  | { type: "red"; execution: ExecutionResource }
  | { type: "repair"; repair: RepairResource; notice: string }
  | { type: "verified"; execution: ExecutionResource; artifact: ArtifactResource }
  | { type: "navigate"; stage: LabStage }
  | { type: "notice"; notice: string }
  | { type: "error"; error: string }
  | { type: "reset" };

const initialState: LabState = {
  stage: "import",
  csrfToken: null,
  workflow: null,
  fixture: null,
  analysis: null,
  scenarios: [],
  beforeExecution: null,
  repair: null,
  afterExecution: null,
  artifact: null,
  busy: null,
  notice: null,
  error: null,
};

function reducer(state: LabState, action: Action): LabState {
  switch (action.type) {
    case "session":
      return { ...state, csrfToken: action.csrfToken, busy: null, error: null };
    case "busy":
      return { ...state, busy: action.label, error: null, notice: null };
    case "imported":
      return {
        ...state,
        workflow: action.workflow,
        fixture: action.fixture,
        csrfToken: action.csrfToken ?? state.csrfToken,
        busy: null,
        notice: `${action.workflow.compatibility.coverage.supported}/${action.workflow.compatibility.coverage.total} supported nodes. Credential references removed: ${action.workflow.credentialReferencesRemoved}.`,
      };
    case "analyzed":
      return {
        ...state,
        analysis: action.analysis,
        stage: "contract",
        busy: null,
        notice: action.notice,
      };
    case "approved":
      return {
        ...state,
        analysis: action.analysis,
        scenarios: action.scenarios,
        stage: "fault",
        busy: null,
        notice: "Plan hash bound to the approved invariant and deterministic scenario set.",
      };
    case "red":
      return {
        ...state,
        beforeExecution: action.execution,
        busy: null,
        notice: `Counterexample reproduced · suite ${action.execution.suite.suiteHash.slice(0, 12)}…`,
      };
    case "repair":
      return {
        ...state,
        repair: action.repair,
        stage: "repair",
        busy: null,
        notice: action.notice,
      };
    case "verified":
      return {
        ...state,
        afterExecution: action.execution,
        artifact: action.artifact,
        stage: "evidence",
        busy: null,
        notice: `Identical suite passed ${action.execution.suite.results.filter((result) => result.passed).length}/${action.execution.suite.results.length} scenarios.`,
      };
    case "navigate":
      return { ...state, stage: action.stage, error: null };
    case "notice":
      return { ...state, notice: action.notice, busy: null };
    case "error":
      return { ...state, error: action.error, busy: null };
    case "reset":
      return initialState;
  }
}

function publicError(error: unknown): string {
  if (error instanceof RetryProofApiError) {
    return `${error.message}${error.requestId ? ` · ${error.requestId}` : ""}`;
  }
  return error instanceof Error ? error.message : "RetryProof could not complete the request.";
}

function nodeKind(type: string): WorkflowNodeView["kind"] {
  if (type.endsWith(".webhook")) return "trigger";
  if (type.endsWith(".httpRequest")) return "effect";
  if (type.endsWith(".if") || type.endsWith(".switch")) return "decision";
  if (type.endsWith(".respondToWebhook")) return "response";
  if (type.endsWith(".postgres")) return "reservation";
  return "transform";
}

function workflowNodes(workflow: WorkflowResource | null): WorkflowNodeView[] {
  if (!workflow) return [];
  return [...workflow.canonical.nodes]
    .sort((left, right) => left.position[0] - right.position[0])
    .map((node) => ({
      id: node.id,
      label: node.name,
      detail: node.type.replace("n8n-nodes-base.", ""),
      kind: nodeKind(node.type),
    }));
}

function approvedInvariant(analysis: AnalysisResource, statement: string): Invariant[] {
  return analysis.result.plan.invariants.map((invariant, index) => ({
    schemaVersion: "1" as const,
    id: invariant.id,
    statement: index === 0 ? statement.trim() : invariant.statement,
    oracle: invariant.oracle,
    sourceNodeIds: invariant.sourceNodeIds,
    approved: true as const,
  }));
}

export function RetryProofApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [invariantChecked, setInvariantChecked] = useState(false);
  const [invariantStatement, setInvariantStatement] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("timeout_after_refund");
  const [mode, setMode] = useState<ModelMode>("cached");

  const initializeSession = useCallback(async () => {
    dispatch({ type: "busy", label: "Establishing anonymous lab session" });
    try {
      dispatch({ type: "session", csrfToken: await establishSession() });
    } catch (error) {
      dispatch({ type: "error", error: publicError(error) });
    }
  }, []);

  useEffect(() => {
    void initializeSession();
  }, [initializeSession]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [state.stage]);

  const unlocked = useMemo(() => {
    const value = new Set<LabStage>(["import"]);
    if (state.analysis) value.add("contract");
    if (state.analysis?.approvedPlan) value.add("fault");
    if (state.repair) value.add("repair");
    if (state.artifact) value.add("evidence");
    return value;
  }, [state.analysis, state.artifact, state.repair]);
  const nodes = useMemo(() => workflowNodes(state.workflow), [state.workflow]);

  const withOperation = async (label: string, operation: () => Promise<void>) => {
    dispatch({ type: "busy", label });
    try {
      await operation();
    } catch (error) {
      dispatch({ type: "error", error: publicError(error) });
    }
  };

  const importDemo = () => {
    if (!state.csrfToken) return;
    void withOperation("Sanitizing seeded workflow", async () => {
      const result = await createDemoWorkflow(state.csrfToken!);
      dispatch({
        type: "imported",
        workflow: result.workflow,
        fixture: result.fixture,
        csrfToken: result.session.csrfToken,
      });
    });
  };

  const importUpload = (workflow: File) => {
    if (!state.csrfToken) return;
    void withOperation("Parsing, sanitizing, and checking compatibility", async () => {
      const result = await uploadWorkflow(state.csrfToken!, workflow);
      dispatch({
        type: "imported",
        workflow: result.workflow,
        fixture: result.fixture,
        csrfToken: result.session.csrfToken,
      });
    });
  };

  const runAnalysis = () => {
    if (!state.csrfToken || !state.workflow) return;
    void withOperation(
      mode === "live" ? "Running bounded GPT-5.6 analysis" : "Loading cached GPT-5.6 analysis",
      async () => {
        const result = await analyzeWorkflow(state.csrfToken!, state.workflow!.id, mode);
        setInvariantStatement(result.analysis.result.plan.invariants[0]?.statement ?? "");
        dispatch({
          type: "analyzed",
          analysis: result.analysis,
          notice:
            result.analysis.result.provenance.mode === "live"
              ? `Live ${result.analysis.result.provenance.model} analysis grounded in the sanitized graph.`
              : "Cached GPT-5.6 demo analysis loaded; deterministic validation remains live.",
        });
      },
    );
  };

  const approve = () => {
    if (!state.csrfToken || !state.analysis || !invariantStatement.trim()) return;
    void withOperation("Binding approved contract and scenarios", async () => {
      const plan = await approvePlan(
        state.csrfToken!,
        state.analysis!,
        approvedInvariant(state.analysis!, invariantStatement),
      );
      const scenarios = await defineScenarios(
        state.csrfToken!,
        plan.analysis.id,
        plan.analysis.result.plan.scenarios.map((scenario) => scenario.id),
      );
      const preferred = scenarios.scenarios.find((scenario) => scenario.id === "timeout_after_refund");
      setSelectedScenario(preferred?.id ?? scenarios.scenarios[0]?.id ?? "");
      dispatch({ type: "approved", analysis: plan.analysis, scenarios: scenarios.scenarios });
    });
  };

  const runFault = () => {
    if (!state.csrfToken || !state.analysis) return;
    void withOperation("Injecting deterministic retry faults", async () => {
      const result = await executeSuite(state.csrfToken!, state.analysis!.id, "before");
      dispatch({ type: "red", execution: result.execution });
    });
  };

  const requestRepair = () => {
    if (!state.csrfToken || !state.analysis) return;
    void withOperation(
      mode === "live" ? "Preparing bounded local Codex repair" : "Loading cached Codex repair",
      async () => {
        const result = await createRepair(state.csrfToken!, state.analysis!.id, mode);
        dispatch({
          type: "repair",
          repair: result.repair,
          notice:
            result.repair.proposal.provenance.mode === "live"
              ? "Codex repair produced; pinned import and credential validators passed."
              : "Cached demonstration repair loaded; pinned import and credential validators passed live.",
        });
      },
    );
  };

  const verifyRepair = () => {
    if (!state.csrfToken || !state.repair) return;
    void withOperation("Rerunning the identical deterministic suite", async () => {
      const result = await recheckRepair(state.csrfToken!, state.repair!.id);
      dispatch({ type: "verified", execution: result.execution, artifact: result.artifact });
    });
  };

  const reset = () => {
    const token = state.csrfToken;
    setInvariantChecked(false);
    setInvariantStatement("");
    dispatch({ type: "reset" });
    void (async () => {
      try {
        if (token) await deleteSession(token);
      } finally {
        await initializeSession();
      }
    })();
  };

  const download = (kind: string) => {
    if (!state.artifact) return;
    if (kind === "bundle") {
      window.location.assign(`/api/v1/artifacts/${state.artifact.id}/download`);
    } else {
      const blob = new Blob([JSON.stringify(state.artifact.receipt, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `retryproof-${state.artifact.id}-evidence.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    dispatch({ type: "notice", notice: `${kind === "bundle" ? "Artifact bundle" : "Evidence receipt"} download started.` });
  };

  return (
    <AppShell
      stage={state.stage}
      unlocked={unlocked}
      onNavigate={(stage) => dispatch({ type: "navigate", stage })}
      onReset={reset}
    >
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div className="live-region" aria-live="polite">{state.busy ?? state.notice ?? state.error}</div>
      {state.notice ? <div className="notice-banner" role="status">{state.notice}</div> : null}
      {state.error ? <div className="error-banner" role="alert">{state.error}</div> : null}
      {state.stage === "import" ? (
        <ImportStep
          imported={Boolean(state.workflow)}
          workflow={state.workflow}
          fixture={state.fixture}
          busy={Boolean(state.busy)}
          sessionReady={Boolean(state.csrfToken)}
          mode={mode}
          onMode={setMode}
          onDemo={importDemo}
          onUpload={importUpload}
          onContinue={runAnalysis}
        />
      ) : null}
      {state.stage === "contract" && state.analysis ? (
        <ContractStep
          approved={Boolean(state.analysis.approvedPlan)}
          checked={invariantChecked}
          onChecked={setInvariantChecked}
          busy={Boolean(state.busy)}
          onApprove={approve}
          analysis={state.analysis}
          nodes={nodes}
          statement={invariantStatement}
          onStatement={setInvariantStatement}
        />
      ) : null}
      {state.stage === "fault" ? (
        <FaultStep
          complete={Boolean(state.beforeExecution)}
          busy={Boolean(state.busy)}
          selectedScenario={selectedScenario}
          onScenario={setSelectedScenario}
          onRun={runFault}
          onRepair={requestRepair}
          scenarios={state.scenarios}
          execution={state.beforeExecution}
          nodes={nodes}
          invariantStatement={state.analysis?.approvedPlan?.invariants[0]?.statement ?? invariantStatement}
        />
      ) : null}
      {state.stage === "repair" && state.repair && state.workflow ? (
        <RepairStep
          approved={Boolean(state.artifact)}
          busy={Boolean(state.busy)}
          onApprove={verifyRepair}
          repair={state.repair}
          workflow={state.workflow}
          nodes={nodes}
        />
      ) : null}
      {state.stage === "evidence" && state.artifact ? (
        <EvidenceStep
          artifact={state.artifact}
          focusScenarioId={selectedScenario}
          onDownload={download}
        />
      ) : null}
    </AppShell>
  );
}
