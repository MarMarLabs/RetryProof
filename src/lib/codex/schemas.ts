import { z } from "zod";

import { invariantSchema, scenarioSchema } from "@/domain";
import { simulationFixtureSchema } from "@/lib/simulator";

export const JsonPatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: z.string().startsWith("/").max(500), value: z.unknown() }).strict(),
  z.object({ op: z.literal("replace"), path: z.string().startsWith("/").max(500), value: z.unknown() }).strict(),
  z.object({ op: z.literal("remove"), path: z.string().startsWith("/").max(500) }).strict(),
]);

export const RepairManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  sourceHash: z.string().min(32).max(128),
  invariantId: z.string().min(1).max(128),
  strategy: z.literal("durable_reservation_before_effect"),
  changedNodeIds: z.array(z.string().min(1).max(200)).min(1).max(20),
  generatedAt: z.string().datetime(),
  generatedBy: z.enum(["codex", "cached-template"]),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
}).strict();

export const RegressionFixtureSchema = z.object({
  schemaVersion: z.literal("1"),
  fixture: simulationFixtureSchema,
  scenarios: z.array(scenarioSchema).min(1).max(12),
  seed: z.string().min(1).max(128),
  invariant: invariantSchema,
  expected: z.object({
    beforePassed: z.literal(false),
    afterPassed: z.literal(true),
  }).strict(),
}).strict();

export const RepairProposalSchema = z.object({
  patch: z.array(JsonPatchOperationSchema).min(1).max(20),
  regressionFixture: RegressionFixtureSchema,
  manifest: RepairManifestSchema,
  readme: z.string().min(50).max(20_000),
  explanation: z.string().min(20).max(2000),
  provenance: z.object({
    mode: z.enum(["live", "cached"]),
    threadId: z.string().optional(),
    attempts: z.number().int().min(1).max(2),
  }).strict(),
}).strict();

export type RepairProposal = z.infer<typeof RepairProposalSchema>;
export type RegressionFixture = z.infer<typeof RegressionFixtureSchema>;
