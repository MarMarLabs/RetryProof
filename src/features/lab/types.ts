export type LabStage = "import" | "contract" | "fault" | "repair" | "evidence";

export type WorkflowNodeView = {
  id: string;
  label: string;
  detail: string;
  kind: "trigger" | "transform" | "decision" | "effect" | "response" | "audit" | "reservation";
};

export type TraceEventView = {
  order: number;
  time: string;
  event: string;
  detail: string;
  node: string;
  outcome: string;
  tone: "neutral" | "warn" | "fail" | "pass";
};

export type ScenarioView = {
  id: string;
  name: string;
  summary: string;
  before: { calls: number; pass: boolean };
  after: { calls: number; pass: boolean };
};

export type LabState = {
  stage: LabStage;
  imported: boolean;
  analyzed: boolean;
  approved: boolean;
  redRunComplete: boolean;
  repairReady: boolean;
  patchApproved: boolean;
  verified: boolean;
  busy: string | null;
  notice: string | null;
  error: string | null;
};
