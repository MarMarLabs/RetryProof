// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RetryProofApp } from "@/features/lab/retryproof-app";
import * as api from "@/features/lab/api-client";
import type { WorkflowResource } from "@/features/lab/api-client";

vi.mock("@/features/lab/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    establishSession: vi.fn(),
    createDemoWorkflow: vi.fn(),
    uploadWorkflow: vi.fn(),
    analyzeWorkflow: vi.fn(),
    approvePlan: vi.fn(),
    defineScenarios: vi.fn(),
    executeSuite: vi.fn(),
    createRepair: vi.fn(),
    recheckRepair: vi.fn(),
    deleteSession: vi.fn(),
  };
});

const workflow: WorkflowResource = {
  id: "wf_test",
  name: "Refund request - unsafe retry",
  sourceHash: "a".repeat(64),
  canonical: {
    schemaVersion: "1" as const,
    n8nExportVersion: "retryproof-n8n-export-v1" as const,
    name: "Refund request - unsafe retry",
    nodes: [
      { id: "webhook_refund", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2.1, position: [0, 0] as const, parameters: {} },
      { id: "normalize_event", name: "Normalize", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [200, 0] as const, parameters: {} },
      { id: "check_event", name: "Check", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [400, 0] as const, parameters: {} },
      { id: "http_refund", name: "Refund", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [600, 0] as const, parameters: { method: "POST", url: "mock://refunds", body: {} } },
      { id: "respond_ok", name: "Respond", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4, position: [800, 0] as const, parameters: {} },
      { id: "audit", name: "Audit", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [1000, 0] as const, parameters: {} },
    ],
    connections: {},
  },
  compatibility: {
    coverage: { supported: 6, total: 6, ratio: 1 },
    nodes: [],
    testedPathNodeIds: ["webhook_refund", "http_refund"],
    blockingNodeIds: [],
    graphIssues: [],
    canExecute: true,
  },
  credentialReferencesRemoved: 1,
};

const invariant = {
  schemaVersion: "1" as const,
  id: "inv_refund_once",
  statement: "At most one refund effect per event.id",
  oracle: { type: "at_most_once_effect" as const, effectId: "refunds", keyPath: "$.key" as const, maximum: 1 as const },
  sourceNodeIds: ["http_refund"],
  approved: true,
};

const scenario = {
  schemaVersion: "1" as const,
  id: "timeout_after_refund",
  type: "effect_succeeded_then_timeout" as const,
  targetNodeId: "http_refund",
  faultPhase: "after_effect_before_response" as const,
  deliveries: 2,
  expectedInvariantIds: ["inv_refund_once"],
};

const duplicateScenario = {
  ...scenario,
  id: "duplicate_delivery",
  type: "duplicate_delivery" as const,
  targetNodeId: "webhook_refund",
  faultPhase: "before_replayed_delivery" as const,
};

const analysis = {
  id: "analysis_test",
  workflowId: workflow.id,
  planVersion: 1,
  planHash: "plan-hash",
  result: {
    plan: {
      schemaVersion: "1" as const,
      workflowId: workflow.id,
      sideEffects: [{
        id: "se_refund",
        nodeId: "http_refund",
        kind: "external_write" as const,
        operation: "POST /refunds",
        reversibility: "irreversible" as const,
        keyCandidates: [{ jsonPath: "$.event.id", confidence: 0.96, evidencePaths: ["$.nodes[3].parameters.body"] }],
        evidence: [{ nodeId: "http_refund", jsonPath: "$.nodes[3].parameters.method", observedValue: "POST", label: "observed" as const }],
        confidence: 0.96,
        requiresConfirmation: true as const,
      }],
      invariants: [{ ...invariant, requiresApproval: true as const, sourceNodeIds: ["http_refund"] }],
      scenarios: [{
        id: scenario.id,
        type: scenario.type,
        targetNodeId: scenario.targetNodeId,
        faultPhase: scenario.faultPhase,
        deliveries: 2,
        expectedInvariantIds: scenario.expectedInvariantIds,
      }],
      unsupported: [],
      limitations: ["No production exactly-once claim"],
    },
    provenance: {
      mode: "cached" as const,
      model: "gpt-5.6-sol",
      promptVersion: "risk-plan-v1",
      latencyMs: 0,
    },
  },
};

function result(passed: boolean, effects: number, scenarioId = scenario.id) {
  return {
    schemaVersion: "1" as const,
    artifactType: "simulation_result" as const,
    workflowId: workflow.id,
    scenarioId,
    seed: "demo-v1",
    passed,
    effects: Array.from({ length: effects }, (_, index) => ({
      id: `effect_${index}`,
      sequence: index + 1,
      effectId: "refunds",
      key: "evt_demo_17",
      nodeId: "http_refund",
      delivery: index + 1,
      at: `2026-01-01T00:00:0${index}.000Z`,
      body: { event_id: "evt_demo_17" },
    })),
    verdicts: [{ invariantId: invariant.id, passed, maximumObserved: effects, violatingKeys: passed ? [] : ["evt_demo_17"] }],
    trace: {
      schemaVersion: "1" as const,
      scenarioId,
      seed: "demo-v1",
      events: [{
        id: "trace_1",
        sequence: 1,
        at: "2026-01-01T00:00:00.000Z",
        type: "effect_recorded" as const,
        delivery: 1,
        nodeId: "http_refund",
        details: { effectId: "refunds" },
      }],
    },
    traceHash: (passed ? "b" : "c").repeat(64),
    limitations: ["No production exactly-once claim"],
  };
}

const beforeExecution = {
  id: "exec_before",
  analysisId: analysis.id,
  phase: "before" as const,
  workflowHash: "1".repeat(64),
  fixtureHash: "2".repeat(64),
  scenarios: [scenario],
  suite: { schemaVersion: "1" as const, workflowId: workflow.id, seed: "demo-v1", passed: false, results: [result(false, 2)], suiteHash: "d".repeat(64) },
};

const afterExecution = {
  id: "exec_after",
  analysisId: analysis.id,
  phase: "after" as const,
  workflowHash: "3".repeat(64),
  fixtureHash: "2".repeat(64),
  scenarios: [scenario],
  suite: { schemaVersion: "1" as const, workflowId: workflow.id, seed: "demo-v1", passed: true, results: [result(true, 1)], suiteHash: "e".repeat(64) },
};

const repair = {
  id: "repair_test",
  analysisId: analysis.id,
  proposal: {
    patch: [{ op: "add" as const, path: "/nodes/-", value: { id: "reserve_event_key" } }],
    regressionFixture: {
      schemaVersion: "1" as const,
      fixture: {
        schemaVersion: "1" as const,
        id: "fixture_refund",
        input: { event: { id: "evt_demo_17", amount: 1299 } },
        httpMocks: [{
          routeId: "refunds_create",
          method: "POST" as const,
          path: "/refunds",
          status: 201,
          responseBody: { status: "created" },
        }],
      },
      scenarios: [scenario],
      seed: "demo-v1",
      invariant,
      expected: { beforePassed: false as const, afterPassed: true as const },
    },
    manifest: {
      schemaVersion: "1" as const,
      sourceHash: workflow.sourceHash,
      invariantId: invariant.id,
      strategy: "durable_reservation_before_effect" as const,
      changedNodeIds: ["reserve_event_key"],
      generatedAt: "2026-01-01T00:00:00.000Z",
      generatedBy: "cached-template" as const,
      limitations: ["No production exactly-once claim"],
    },
    readme: "# Repair\n\nThis is a deterministic reviewable repair fixture for the RetryProof test journey.",
    explanation: "Reserve the approved event key before the external effect.",
    provenance: { mode: "cached" as const, attempts: 1 },
  },
  regressionValidation: {
    beforePassed: false as const,
    afterPassed: true as const,
    beforeSuiteHash: "4".repeat(64),
    afterSuiteHash: "5".repeat(64),
    sourceWorkflowHash: "1".repeat(64),
    repairedWorkflowHash: "3".repeat(64),
    fixtureHash: "2".repeat(64),
    scenarioIds: [scenario.id],
    checks: [
      "source_hash_bound" as const,
      "patch_structure_valid" as const,
      "credential_scan_clear" as const,
      "source_fixture_failed" as const,
      "repaired_fixture_passed" as const,
    ],
  },
};

const approvedAnalysis = {
  ...analysis,
  approvedPlan: { planVersion: 1, invariants: [invariant], approved: true as const },
  approvedAt: "2026-01-01T00:00:00.000Z",
};

const artifact = {
  id: "artifact_test",
  analysisId: analysis.id,
  repairId: repair.id,
  sha256: "f".repeat(64),
  receipt: {
    schemaVersion: "1" as const,
    claim: "The approved invariant passed the declared deterministic fault scenarios after repair.",
    workflow: {
      id: workflow.id,
      sourceHash: workflow.sourceHash,
      name: workflow.name,
      coverage: workflow.compatibility.coverage,
    },
    invariant,
    before: {
      ...beforeExecution.suite,
      results: [
        result(false, 2, duplicateScenario.id),
        result(false, 2, scenario.id),
      ],
      workflowHash: beforeExecution.workflowHash,
      fixtureHash: beforeExecution.fixtureHash,
      scenarios: [duplicateScenario, scenario],
    },
    after: {
      ...afterExecution.suite,
      results: [
        result(true, 1, duplicateScenario.id),
        result(true, 1, scenario.id),
      ],
      workflowHash: afterExecution.workflowHash,
      fixtureHash: afterExecution.fixtureHash,
      scenarios: [duplicateScenario, scenario],
    },
    repair: {
      ...repair.proposal,
      id: repair.id,
      repairedWorkflowHash: "a".repeat(64),
    },
    limitations: ["RetryProof does not claim exactly-once execution or production safety."],
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
};

describe("RetryProof judged journey", () => {
  beforeEach(() => {
    vi.mocked(api.establishSession).mockResolvedValue("csrf-test");
    vi.mocked(api.createDemoWorkflow).mockResolvedValue({ session: { csrfToken: "csrf-test" }, workflow, fixture: { input: { event: { id: "evt_demo_17" } } } });
    vi.mocked(api.analyzeWorkflow).mockResolvedValue({ analysis });
    vi.mocked(api.approvePlan).mockResolvedValue({ analysis: approvedAnalysis });
    vi.mocked(api.defineScenarios).mockResolvedValue({ scenarios: [scenario] });
    vi.mocked(api.executeSuite).mockResolvedValue({ execution: beforeExecution });
    vi.mocked(api.createRepair).mockResolvedValue({ repair });
    vi.mocked(api.recheckRepair).mockResolvedValue({ execution: afterExecution, artifact });
    vi.mocked(api.deleteSession).mockResolvedValue();
  });

  it("drives the actual five-stage interface from import to an evidence receipt", async () => {
    render(<RetryProofApp />);
    const demo = await screen.findByRole("button", { name: /try refund demo/i });
    await waitFor(() => expect(demo).toBeEnabled());
    fireEvent.click(demo);
    expect(await screen.findByText(workflow.name)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /analyze risk contract/i }));
    expect(await screen.findByRole("heading", { name: /approve the contract/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /approve this invariant/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve invariant/i }));

    expect(await screen.findByRole("heading", { name: "Fault Lab" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run selected fault/i }));
    expect(await screen.findByText("INVARIANT FAILED")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /request codex repair/i }));

    expect(await screen.findByRole("heading", { name: /review the codex repair/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /approve and verify/i }));
    expect(await screen.findByText("ALL DECLARED SCENARIOS PASSED")).toBeInTheDocument();
    expect(screen.getByText(artifact.id)).toBeInTheDocument();
    expect(
      screen.getByText(/evt_demo_17 · timeout_after_refund · 2 deliveries/i),
    ).toBeInTheDocument();

    expect(api.analyzeWorkflow).toHaveBeenCalledWith("csrf-test", workflow.id, "cached");
    expect(api.recheckRepair).toHaveBeenCalledWith("csrf-test", repair.id);
  });
});
