import { createHash } from "node:crypto";

import {
  PINNED_N8N_EXPORT_VERSION,
  type CanonicalN8nNode,
  type CanonicalN8nWorkflow,
  type N8nWorkflowExport,
} from "./types";

function canonicalNode(node: N8nWorkflowExport["nodes"][number]): CanonicalN8nNode {
  const canonical: CanonicalN8nNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: [node.position[0], node.position[1]],
    parameters: structuredClone(node.parameters),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
  };
  return canonical;
}

/**
 * Drops UI notes, pin data, instance metadata, credential references, and other
 * envelope state. The result is the only workflow representation suitable for
 * persistence or model input.
 */
export function canonicalizeN8nWorkflow(
  workflow: N8nWorkflowExport,
): CanonicalN8nWorkflow {
  const nodes = workflow.nodes
    .map(canonicalNode)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: "1",
    n8nExportVersion: PINNED_N8N_EXPORT_VERSION,
    name: workflow.name,
    nodes,
    connections: structuredClone(workflow.connections),
  };
}

function serializeStable(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Only finite JSON numbers are supported.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Circular values cannot be canonicalized.");
    seen.add(value);
    const result = `[${value.map((entry) => serializeStable(entry, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Circular values cannot be canonicalized.");
    seen.add(value);
    const object = value as Record<string, unknown>;
    const result = `{${Object.keys(object)
      .sort()
      .map((key) => {
        if (object[key] === undefined) {
          throw new TypeError("Undefined values cannot be canonicalized.");
        }
        return `${JSON.stringify(key)}:${serializeStable(object[key], seen)}`;
      })
      .join(",")}}`;
    seen.delete(value);
    return result;
  }
  throw new TypeError("Only JSON values can be canonicalized.");
}

export function stableStringify(value: unknown): string {
  return serializeStable(value, new Set());
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

export function hashCanonicalN8nWorkflow(
  workflow: CanonicalN8nWorkflow,
): string {
  return sha256Canonical(workflow);
}
