import { z } from "zod";

import { identifier, jsonValue, schemaVersion } from "./common";

export const traceEventTypeSchema = z.enum([
  "delivery_started",
  "delivery_completed",
  "delivery_failed",
  "node_started",
  "node_completed",
  "reservation_acquired",
  "reservation_conflict",
  "http_mock_called",
  "effect_recorded",
  "fault_injected",
  "response_emitted",
  "invariant_evaluated",
]);

export const traceEventSchema = z
  .object({
    id: identifier,
    sequence: z.number().int().nonnegative(),
    at: z.string().datetime({ offset: true }),
    type: traceEventTypeSchema,
    delivery: z.number().int().positive().optional(),
    nodeId: identifier.optional(),
    details: z.record(z.string(), jsonValue).default({}),
  })
  .strict();

export const executionTraceSchema = z
  .object({
    schemaVersion,
    scenarioId: identifier,
    seed: z.string().min(1).max(128),
    events: z.array(traceEventSchema),
  })
  .strict();

export type TraceEvent = z.infer<typeof traceEventSchema>;
export type ExecutionTrace = z.infer<typeof executionTraceSchema>;
