import { z } from "zod";

export const SCHEMA_VERSION = "1" as const;
export const schemaVersion = z.literal(SCHEMA_VERSION);
export const MAX_JSON_PATH_INDEX = 256;

export const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);

export const jsonPrimitive = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitive, z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

export const jsonPath = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\$(?:(?:\.[A-Za-z_][A-Za-z0-9_]*)|(?:\[(?:0|[1-9][0-9]*)\]))*$/)
  .refine(
    (path) =>
      [...path.matchAll(/\[(\d+)\]/g)].every(
        (match) => Number(match[1]) <= MAX_JSON_PATH_INDEX,
      ),
    `JSONPath array indexes must not exceed ${MAX_JSON_PATH_INDEX}`,
  )
  .refine(
    (path) => !/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|\[|$)/.test(path),
    "Prototype-related JSONPath segments are not allowed",
  );

export const expressionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: jsonValue }).strict(),
  z.object({ kind: z.literal("json_path"), path: jsonPath }).strict(),
]);

export type Expression = z.infer<typeof expressionSchema>;
