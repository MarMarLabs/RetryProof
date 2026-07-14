import { TextDecoder } from "node:util";

import { z } from "zod";

import { N8nIngestionError } from "./errors";
import {
  FORBIDDEN_PROPERTY_NAMES,
  appendJsonPath,
  segmentsToJsonPath,
} from "./json-path";
import {
  N8nWorkflowExportSchema,
  type N8nWorkflowExport,
} from "./types";

export const MAX_N8N_UPLOAD_BYTES = 1024 * 1024;
export const MAX_N8N_JSON_DEPTH = 64;
export const MAX_N8N_EDGES = 2048;
export const MAX_N8N_JSON_VALUES = 50_000;

export type ParseN8nWorkflowOptions = Readonly<{
  maxBytes?: number;
  maxDepth?: number;
}>;

function decodeInput(input: string | Uint8Array, maxBytes: number): string {
  const byteLength =
    typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;

  if (byteLength > maxBytes) {
    throw new N8nIngestionError(
      "UPLOAD_TOO_LARGE",
      "Workflow upload exceeds the allowed size.",
      { limit: maxBytes },
    );
  }

  if (typeof input === "string") {
    return input;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new N8nIngestionError(
      "INVALID_UTF8",
      "Workflow upload must be valid UTF-8.",
    );
  }
}

function jsonLocation(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const positionMatch = /position\s+(\d+)/i.exec(message);
  if (!positionMatch) {
    return {};
  }

  const position = Math.min(Number(positionMatch[1]), source.length);
  const prefix = source.slice(0, position);
  const lines = prefix.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function validateJsonSafety(value: unknown, maxDepth: number): void {
  const pending: Array<{ value: unknown; depth: number; path: string }> = [
    { value, depth: 0, path: "$" },
  ];
  let valueCount = 1;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    if (current.depth > maxDepth) {
      throw new N8nIngestionError(
        "MAX_DEPTH_EXCEEDED",
        "Workflow JSON exceeds the allowed nesting depth.",
        { jsonPaths: [current.path], limit: maxDepth },
      );
    }

    if (current.value === null || typeof current.value !== "object") {
      continue;
    }

    if (Array.isArray(current.value)) {
      valueCount += current.value.length;
      if (valueCount > MAX_N8N_JSON_VALUES) {
        throw new N8nIngestionError(
          "JSON_VALUE_LIMIT_EXCEEDED",
          "Workflow JSON contains too many values.",
          { limit: MAX_N8N_JSON_VALUES },
        );
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: current.value[index],
          depth: current.depth + 1,
          path: appendJsonPath(current.path, index),
        });
      }
      continue;
    }

    const keys = Object.keys(current.value);
    valueCount += keys.length;
    if (valueCount > MAX_N8N_JSON_VALUES) {
      throw new N8nIngestionError(
        "JSON_VALUE_LIMIT_EXCEEDED",
        "Workflow JSON contains too many values.",
        { limit: MAX_N8N_JSON_VALUES },
      );
    }
    for (const key of keys) {
      const path = appendJsonPath(current.path, key);
      if (FORBIDDEN_PROPERTY_NAMES.has(key)) {
        throw new N8nIngestionError(
          "DANGEROUS_PROPERTY",
          "Workflow JSON contains a forbidden property name.",
          { jsonPaths: [path] },
        );
      }
      pending.push({
        value: (current.value as Record<string, unknown>)[key],
        depth: current.depth + 1,
        path,
      });
    }
  }
}

function issuePath(issue: z.core.$ZodIssue): string {
  const segments = issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === "string" || typeof segment === "number",
  );
  return segmentsToJsonPath(segments);
}

function assertUniqueNodes(workflow: N8nWorkflowExport): void {
  const ids = new Set<string>();
  const names = new Set<string>();

  for (let index = 0; index < workflow.nodes.length; index += 1) {
    const node = workflow.nodes[index];
    if (ids.has(node.id)) {
      throw new N8nIngestionError(
        "DUPLICATE_NODE_ID",
        "Workflow node IDs must be unique.",
        { jsonPaths: [`$.nodes[${index}].id`] },
      );
    }
    ids.add(node.id);

    if (names.has(node.name)) {
      throw new N8nIngestionError(
        "DUPLICATE_NODE_NAME",
        "Workflow node names must be unique.",
        { jsonPaths: [`$.nodes[${index}].name`] },
      );
    }
    names.add(node.name);
  }
}

function assertValidConnections(workflow: N8nWorkflowExport): void {
  const names = new Set(workflow.nodes.map((node) => node.name));
  let edgeCount = 0;

  for (const [sourceName, connection] of Object.entries(workflow.connections)) {
    if (!names.has(sourceName)) {
      throw new N8nIngestionError(
        "GRAPH_REFERENCE_INVALID",
        "Workflow connection references an unknown source node.",
        { jsonPaths: [appendJsonPath("$.connections", sourceName)] },
      );
    }

    for (let outputIndex = 0; outputIndex < connection.main.length; outputIndex += 1) {
      const targets = connection.main[outputIndex];
      edgeCount += targets.length;
      if (edgeCount > MAX_N8N_EDGES) {
        throw new N8nIngestionError(
          "GRAPH_TOO_LARGE",
          "Workflow contains too many connections.",
          { limit: MAX_N8N_EDGES },
        );
      }
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
        if (!names.has(targets[targetIndex].node)) {
          throw new N8nIngestionError(
            "GRAPH_REFERENCE_INVALID",
            "Workflow connection references an unknown target node.",
            {
              jsonPaths: [
                `${appendJsonPath("$.connections", sourceName)}.main[${outputIndex}][${targetIndex}].node`,
              ],
            },
          );
        }
      }
    }
  }
}

export function parseN8nWorkflow(
  input: string | Uint8Array,
  options: ParseN8nWorkflowOptions = {},
): N8nWorkflowExport {
  const maxBytes = options.maxBytes ?? MAX_N8N_UPLOAD_BYTES;
  const maxDepth = options.maxDepth ?? MAX_N8N_JSON_DEPTH;
  const source = decodeInput(input, maxBytes);

  let decoded: unknown;
  try {
    decoded = JSON.parse(source) as unknown;
  } catch (error) {
    throw new N8nIngestionError(
      "INVALID_JSON",
      "Workflow upload is not valid JSON.",
      jsonLocation(source, error),
    );
  }

  validateJsonSafety(decoded, maxDepth);
  const parsed = N8nWorkflowExportSchema.safeParse(decoded);
  if (!parsed.success) {
    const paths = [...new Set(parsed.error.issues.map(issuePath))].sort();
    throw new N8nIngestionError(
      "INVALID_WORKFLOW",
      "Workflow does not match the accepted n8n export shape.",
      { jsonPaths: paths },
    );
  }

  assertUniqueNodes(parsed.data);
  assertValidConnections(parsed.data);
  return parsed.data;
}
