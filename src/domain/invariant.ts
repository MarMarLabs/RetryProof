import { z } from "zod";

import { identifier, schemaVersion } from "./common";

export const invariantSchema = z
  .object({
    schemaVersion,
    id: identifier,
    statement: z.string().min(1).max(500),
    oracle: z
      .object({
        type: z.literal("at_most_once_effect"),
        effectId: identifier,
        keyPath: z.literal("$.key"),
        maximum: z.literal(1),
      })
      .strict(),
    sourceNodeIds: z.array(identifier).min(1).max(20),
    approved: z.boolean(),
  })
  .strict();

export type Invariant = z.infer<typeof invariantSchema>;
