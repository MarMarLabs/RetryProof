import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const N8nCredentialReferenceSchema = z
  .strictObject({
    id: z.string().min(1).max(256).optional(),
    name: z.string().min(1).max(256).optional(),
  })
  .refine((value) => value.id !== undefined || value.name !== undefined, {
    message: "Credential references require an id or name.",
  });

export const N8nNodeSchema = z.strictObject({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  type: z.string().min(1).max(256),
  typeVersion: z.number().finite().positive(),
  position: z.tuple([z.number().finite(), z.number().finite()]),
  parameters: z.record(z.string(), JsonValueSchema),
  credentials: z
    .record(z.string().min(1).max(256), N8nCredentialReferenceSchema)
    .optional(),
  webhookId: z.string().max(256).optional(),
  disabled: z.boolean().optional(),
  notes: z.string().max(20_000).optional(),
  notesInFlow: z.boolean().optional(),
  executeOnce: z.boolean().optional(),
  alwaysOutputData: z.boolean().optional(),
  retryOnFail: z.boolean().optional(),
  maxTries: z.number().int().min(1).max(10).optional(),
  waitBetweenTries: z.number().int().min(0).max(300_000).optional(),
  continueOnFail: z.boolean().optional(),
  onError: z
    .enum(["stopWorkflow", "continueRegularOutput", "continueErrorOutput"])
    .optional(),
});

export const N8nConnectionTargetSchema = z.strictObject({
  node: z.string().min(1).max(256),
  type: z.literal("main"),
  index: z.number().int().nonnegative().max(32),
});

export const N8nNodeConnectionsSchema = z.strictObject({
  main: z
    .array(z.array(N8nConnectionTargetSchema).max(256))
    .max(32),
});

const N8nTagSchema = z.strictObject({
  id: z.string().max(256).optional(),
  name: z.string().max(256).optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
});

/**
 * Strict allowlist for the n8n export envelope RetryProof accepts. Node
 * parameters remain JSON data because their shape is validated by the local
 * versioned node catalog, never executed.
 */
export const N8nWorkflowExportSchema = z.strictObject({
  id: z.string().max(256).optional(),
  name: z.string().min(1).max(256),
  active: z.boolean().optional(),
  nodes: z.array(N8nNodeSchema).min(1).max(256),
  connections: z.record(z.string(), N8nNodeConnectionsSchema),
  settings: z.record(z.string(), JsonValueSchema).optional(),
  staticData: z.record(z.string(), JsonValueSchema).nullable().optional(),
  pinData: z.record(z.string(), JsonValueSchema).optional(),
  versionId: z.string().max(256).optional(),
  meta: z.record(z.string(), JsonValueSchema).optional(),
  tags: z.array(N8nTagSchema).max(100).optional(),
});

export type N8nCredentialReference = z.infer<
  typeof N8nCredentialReferenceSchema
>;
export type N8nNode = z.infer<typeof N8nNodeSchema>;
export type N8nConnectionTarget = z.infer<
  typeof N8nConnectionTargetSchema
>;
export type N8nNodeConnections = z.infer<typeof N8nNodeConnectionsSchema>;
export type N8nWorkflowExport = z.infer<typeof N8nWorkflowExportSchema>;

export const PINNED_N8N_EXPORT_VERSION = "retryproof-n8n-export-v1";

export type CanonicalN8nNode = Readonly<{
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: readonly [number, number];
  parameters: Readonly<Record<string, JsonValue>>;
  disabled?: boolean;
}>;

export type CanonicalN8nWorkflow = Readonly<{
  schemaVersion: "1";
  n8nExportVersion: typeof PINNED_N8N_EXPORT_VERSION;
  name: string;
  nodes: readonly CanonicalN8nNode[];
  connections: Readonly<Record<string, N8nNodeConnections>>;
}>;
