import { z } from "zod";

import { identifier, jsonValue, schemaVersion } from "./common";
import { executionTraceSchema } from "./trace";

export const invariantVerdictSchema = z
  .object({
    invariantId: identifier,
    passed: z.boolean(),
    maximumObserved: z.number().int().nonnegative(),
    violatingKeys: z.array(z.string()),
  })
  .strict();

export const simulationArtifactSchema = z
  .object({
    schemaVersion,
    artifactType: z.literal("simulation_result"),
    workflowId: identifier,
    scenarioId: identifier,
    seed: z.string().min(1).max(128),
    passed: z.boolean(),
    effects: z.array(
      z
        .object({
          id: identifier,
          sequence: z.number().int().positive(),
          effectId: identifier,
          key: z.string().max(512),
          nodeId: identifier,
          delivery: z.number().int().positive(),
          at: z.string().datetime({ offset: true }),
          body: z.record(z.string(), jsonValue),
        })
        .strict(),
    ),
    verdicts: z.array(invariantVerdictSchema).min(1),
    trace: executionTraceSchema,
    traceHash: z.string().regex(/^[a-f0-9]{64}$/),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type InvariantVerdict = z.infer<typeof invariantVerdictSchema>;
export type SimulationArtifact = z.infer<typeof simulationArtifactSchema>;
