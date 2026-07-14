import { z } from "zod";

import { identifier, schemaVersion } from "./common";

export const faultPhaseSchema = z.enum([
  "before_effect",
  "after_effect_before_response",
  "after_node",
  "before_replayed_delivery",
]);

const scenarioBase = {
  schemaVersion,
  id: identifier,
  targetNodeId: identifier,
  deliveries: z.number().int().min(2).max(10).default(2),
  expectedInvariantIds: z.array(identifier).min(1).max(20),
};

export const scenarioSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...scenarioBase,
      type: z.literal("duplicate_delivery"),
      faultPhase: z.literal("before_replayed_delivery"),
    })
    .strict(),
  z
    .object({
      ...scenarioBase,
      type: z.literal("effect_succeeded_then_timeout"),
      faultPhase: z.literal("after_effect_before_response"),
    })
    .strict(),
  z
    .object({
      ...scenarioBase,
      type: z.literal("rate_limited_then_retry"),
      faultPhase: z.literal("before_effect"),
    })
    .strict(),
  z
    .object({
      ...scenarioBase,
      type: z.literal("partial_failure_then_retry"),
      faultPhase: z.literal("after_node"),
    })
    .strict(),
]);

export type FaultPhase = z.infer<typeof faultPhaseSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
