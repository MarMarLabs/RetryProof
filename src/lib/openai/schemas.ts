import { z } from "zod";

export const EvidenceSchema = z.object({
  nodeId: z.string().min(1),
  jsonPath: z.string().min(1),
  observedValue: z.string().max(500).nullable(),
  label: z.enum(["observed", "inferred", "unknown"]),
});

export const KeyCandidateSchema = z.object({
  jsonPath: z.string().startsWith("$"),
  confidence: z.number().min(0).max(1),
  evidencePaths: z.array(z.string()).min(1),
});

export const SideEffectSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  kind: z.enum(["external_write", "logical_write", "read", "unknown"]),
  operation: z.string().min(1).max(200),
  reversibility: z.enum(["reversible", "compensatable", "irreversible", "unknown"]),
  keyCandidates: z.array(KeyCandidateSchema).max(5),
  evidence: z.array(EvidenceSchema).min(1).max(12),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.literal(true),
});

export const OracleSchema = z.object({
  type: z.literal("at_most_once_effect"),
  effectId: z.string().min(1),
  keyPath: z.literal("$.key"),
  maximum: z.literal(1),
});

export const InvariantProposalSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1).max(240),
  oracle: OracleSchema,
  sourceNodeIds: z.array(z.string()).min(1),
  requiresApproval: z.literal(true),
});

export const ScenarioProposalSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "duplicate_delivery",
    "effect_succeeded_then_timeout",
    "failure_before_effect",
    "after_effect_replay",
  ]),
  targetNodeId: z.string().min(1),
  faultPhase: z.enum([
    "before_effect",
    "after_effect_before_response",
    "after_node",
    "before_replayed_delivery",
  ]),
  deliveries: z.number().int().min(1).max(3),
  expectedInvariantIds: z.array(z.string()).min(1),
});

export const RiskPlanSchema = z.object({
  schemaVersion: z.literal("1"),
  workflowId: z.string().min(1),
  sideEffects: z.array(SideEffectSchema).max(12),
  invariants: z.array(InvariantProposalSchema).max(12),
  scenarios: z.array(ScenarioProposalSchema).max(16),
  unsupported: z.array(
    z.object({
      nodeId: z.string().min(1).max(256),
      reason: z.string().min(1).max(240),
    }),
  ).max(12),
  limitations: z.array(z.string().max(240)).min(1).max(12),
});

export type RiskPlan = z.infer<typeof RiskPlanSchema>;

export const AnalyzerResultSchema = z.object({
  plan: RiskPlanSchema,
  provenance: z.object({
    mode: z.enum(["live", "cached", "manual"]),
    model: z.string(),
    requestId: z.string().optional(),
    promptVersion: z.string(),
    latencyMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  }),
});

export type AnalyzerResult = z.infer<typeof AnalyzerResultSchema>;
