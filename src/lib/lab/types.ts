import type { AnalyzerResult, RiskPlan } from "@/lib/openai/schemas";
import type { CompatibilityReport, CanonicalN8nWorkflow, N8nWorkflowExport } from "@/lib/n8n";
import type { RepairProposal } from "@/lib/codex/schemas";
import type { Invariant, Scenario, WorkflowSnapshot } from "@/domain";
import type { SimulationFixture, SimulationSuite } from "@/lib/simulator";

export const LAB_TTL_MS = 24 * 60 * 60 * 1_000;

export interface LabOwnedRecord {
  id: string;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

export interface WorkflowRecord extends LabOwnedRecord {
  kind: "workflow";
  name: string;
  sourceHash: string;
  sanitizedWorkflow: N8nWorkflowExport;
  canonical: CanonicalN8nWorkflow;
  compatibility: CompatibilityReport;
  fixture: SimulationFixture;
  simulatorWorkflow?: WorkflowSnapshot;
  credentialReferencesRemoved: number;
  demoSeed: boolean;
}

export interface ApprovedPlan {
  planVersion: number;
  invariants: Invariant[];
  approved: true;
}

export interface AnalysisRecord extends LabOwnedRecord {
  kind: "analysis";
  workflowId: string;
  planVersion: number;
  planHash: string;
  result: AnalyzerResult;
  approvedPlan?: ApprovedPlan;
  approvedAt?: string;
}

export interface ScenarioSetRecord extends LabOwnedRecord {
  kind: "scenario_set";
  analysisId: string;
  scenarios: Scenario[];
}

export interface ExecutionRecord extends LabOwnedRecord {
  kind: "execution";
  analysisId: string;
  phase: "before" | "after";
  repairId?: string;
  workflowHash: string;
  fixtureHash: string;
  scenarios: Scenario[];
  suite: SimulationSuite;
}

export interface RegressionValidation {
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
}

export interface RepairRecord extends LabOwnedRecord {
  kind: "repair";
  analysisId: string;
  proposal: RepairProposal;
  repairedWorkflow: WorkflowSnapshot;
  regressionValidation: RegressionValidation;
}

export interface EvidenceReceipt {
  schemaVersion: "1";
  claim: string;
  workflow: {
    id: string;
    sourceHash: string;
    name: string;
    coverage: WorkflowRecord["compatibility"]["coverage"];
  };
  invariant: Invariant;
  before: Pick<ExecutionRecord, "workflowHash" | "fixtureHash" | "scenarios"> &
    Pick<SimulationSuite, "passed" | "suiteHash" | "results">;
  after: Pick<ExecutionRecord, "workflowHash" | "fixtureHash" | "scenarios"> &
    Pick<SimulationSuite, "passed" | "suiteHash" | "results">;
  repair: Pick<RepairProposal, "patch" | "manifest" | "explanation" | "regressionFixture" | "readme"> & {
    id: string;
    repairedWorkflowHash: string;
  };
  limitations: string[];
  generatedAt: string;
}

export interface ArtifactRecord extends LabOwnedRecord {
  kind: "artifact";
  analysisId: string;
  repairId: string;
  receipt: EvidenceReceipt;
  sha256: string;
}

export type LabRecord =
  | WorkflowRecord
  | AnalysisRecord
  | ScenarioSetRecord
  | ExecutionRecord
  | RepairRecord
  | ArtifactRecord;

export type LabRecordKind = LabRecord["kind"];

export type PublicWorkflow = Pick<
  WorkflowRecord,
  "id" | "name" | "sourceHash" | "canonical" | "compatibility" | "credentialReferencesRemoved"
>;

export type PublicAnalysis = Pick<
  AnalysisRecord,
  "id" | "workflowId" | "planVersion" | "planHash" | "result" | "approvedPlan" | "approvedAt"
>;

export type PublicRepair = Pick<
  RepairRecord,
  "id" | "analysisId" | "proposal" | "regressionValidation"
>;

export type PlanProposal = RiskPlan;

export function publicWorkflow(record: WorkflowRecord): PublicWorkflow {
  const { id, name, sourceHash, canonical, compatibility, credentialReferencesRemoved } = record;
  return { id, name, sourceHash, canonical, compatibility, credentialReferencesRemoved };
}

export function publicAnalysis(record: AnalysisRecord): PublicAnalysis {
  const { id, workflowId, planVersion, planHash, result, approvedPlan, approvedAt } = record;
  return { id, workflowId, planVersion, planHash, result, approvedPlan, approvedAt };
}

export function publicRepair(record: RepairRecord): PublicRepair {
  return {
    id: record.id,
    analysisId: record.analysisId,
    proposal: record.proposal,
    regressionValidation: record.regressionValidation,
  };
}
