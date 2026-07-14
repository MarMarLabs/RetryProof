import { z } from "zod";

import {
  expressionSchema,
  identifier,
  jsonPath,
  schemaVersion,
} from "./common";

const nodeBase = {
  id: identifier,
  name: z.string().min(1).max(200),
};

const optionalNext = identifier.nullable().optional();

export const webhookNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("webhook"),
    next: optionalNext,
  })
  .strict();

export const setNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("set"),
    assignments: z
      .array(
        z
          .object({ targetPath: jsonPath, value: expressionSchema })
          .strict(),
      )
      .min(1)
      .max(50),
    next: optionalNext,
  })
  .strict();

export const conditionSchema = z
  .object({
    left: expressionSchema,
    operator: z.enum(["equals", "not_equals", "exists", "truthy"]),
    right: expressionSchema.optional(),
  })
  .strict();

export const ifNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("if"),
    condition: conditionSchema,
    whenTrue: optionalNext,
    whenFalse: optionalNext,
  })
  .strict();

export const switchNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("switch"),
    value: expressionSchema,
    cases: z
      .array(
        z
          .object({ equals: expressionSchema, next: identifier })
          .strict(),
      )
      .min(1)
      .max(20),
    defaultNext: optionalNext,
  })
  .strict();

export const httpRequestNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("http_request"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    routeId: identifier,
    path: z.string().min(1).max(512).regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/),
    body: z.record(z.string(), expressionSchema).default({}),
    effect: z
      .object({
        id: identifier,
        key: expressionSchema,
      })
      .strict()
      .optional(),
    next: optionalNext,
  })
  .strict();

export const reservationNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("reservation"),
    namespace: identifier,
    key: expressionSchema,
    acquiredNext: optionalNext,
    conflictNext: optionalNext,
  })
  .strict();

export const respondNodeSchema = z
  .object({
    ...nodeBase,
    type: z.literal("respond"),
    status: z.number().int().min(100).max(599),
    body: z.record(z.string(), expressionSchema).default({}),
  })
  .strict();

export const workflowNodeSchema = z.discriminatedUnion("type", [
  webhookNodeSchema,
  setNodeSchema,
  ifNodeSchema,
  switchNodeSchema,
  httpRequestNodeSchema,
  reservationNodeSchema,
  respondNodeSchema,
]);

export const workflowSnapshotSchema = z
  .object({
    schemaVersion,
    id: identifier,
    name: z.string().min(1).max(200),
    entryNodeId: identifier,
    nodes: z.array(workflowNodeSchema).min(1).max(100),
  })
  .strict()
  .superRefine((workflow, context) => {
    const ids = workflow.nodes.map((node) => node.id);
    const known = new Set(ids);
    if (known.size !== ids.length) {
      context.addIssue({ code: "custom", message: "Node IDs must be unique" });
    }
    if (!known.has(workflow.entryNodeId)) {
      context.addIssue({ code: "custom", message: "entryNodeId must reference a node" });
    }

    const references: string[] = [];
    for (const node of workflow.nodes) {
      if ("next" in node && node.next) references.push(node.next);
      if (node.type === "if") {
        if (node.whenTrue) references.push(node.whenTrue);
        if (node.whenFalse) references.push(node.whenFalse);
      }
      if (node.type === "switch") {
        references.push(...node.cases.map((item) => item.next));
        if (node.defaultNext) references.push(node.defaultNext);
      }
      if (node.type === "reservation") {
        if (node.acquiredNext) references.push(node.acquiredNext);
        if (node.conflictNext) references.push(node.conflictNext);
      }
    }
    for (const reference of references) {
      if (!known.has(reference)) {
        context.addIssue({
          code: "custom",
          message: `Unknown node reference: ${reference}`,
        });
      }
    }
  });

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowSnapshot = z.infer<typeof workflowSnapshotSchema>;
