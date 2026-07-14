import { N8nIngestionError } from "./errors";
import { parseNarrowExpression } from "./expressions";
import { appendJsonPath } from "./json-path";
import type { N8nWorkflowExport } from "./types";

const SENSITIVE_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|password|passwd|secret|client[_-]?secret|private[_-]?key|signing[_-]?key|token)$/i;
const SENSITIVE_HEADER = /(?:^|[-_])(?:authorization|proxy[-_]?authorization|api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|bearer|secret|credential)(?:$|[-_])/i;

const SECRET_VALUE_PATTERNS = [
  /^(?:sk|rk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}$/,
  /^sk-[A-Za-z0-9_-]{16,}$/,
  /^(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^(?:Bearer|Basic)\s+\S{8,}$/i,
  /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /:\/\/[^/\s:@]+:[^@\s/]+@/,
  /[?&](?:api[_-]?key|access[_-]?token|token|secret|key)=[^&#\s]{6,}/i,
];

function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  const expression = parseNarrowExpression(trimmed);
  return (
    trimmed.length === 0 ||
    /^(?:\*+|<redacted>|redacted|placeholder|example|changeme)$/i.test(trimmed) ||
    /^\$\{[A-Z][A-Z0-9_]*\}$/.test(trimmed) ||
    (expression.supported && expression.expression.kind === "json_path")
  );
}

function hasInlineSecretShape(value: unknown, sensitiveKey: boolean): boolean {
  if (typeof value !== "string") {
    return sensitiveKey && value !== null && value !== undefined;
  }
  if (isPlaceholder(value)) return false;
  return sensitiveKey || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function isCredentialReferencePath(path: string): boolean {
  return /^\$\.nodes\[\d+\]\.credentials$/.test(path);
}

/** Returns only locations. The corresponding values are intentionally absent. */
export function scanInlineSecretPaths(value: unknown): readonly string[] {
  const found = new Set<string>();
  const pending: Array<{ value: unknown; path: string }> = [
    { value, path: "$" },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    if (current.value === null || typeof current.value !== "object") {
      if (
        typeof current.value === "string" &&
        hasInlineSecretShape(current.value, false)
      ) {
        found.add(current.path);
      }
      continue;
    }

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: current.value[index],
          path: appendJsonPath(current.path, index),
        });
      }
      continue;
    }

    const object = current.value as Record<string, unknown>;
    if (
      typeof object.name === "string" &&
      SENSITIVE_HEADER.test(object.name) &&
      Object.prototype.hasOwnProperty.call(object, "value") &&
      hasInlineSecretShape(object.value, true)
    ) {
      found.add(appendJsonPath(current.path, "value"));
    }

    for (const [key, child] of Object.entries(object)) {
      const path = appendJsonPath(current.path, key);
      if (isCredentialReferencePath(path)) continue;

      if (hasInlineSecretShape(child, SENSITIVE_KEY.test(key))) {
        found.add(path);
      }

      if (child !== null && typeof child === "object") {
        pending.push({ value: child, path });
      }
    }
  }

  return [...found].sort();
}

export type SanitizedWorkflow = Readonly<{
  workflow: N8nWorkflowExport;
  credentialReferencesRemoved: number;
  inlineSecretPaths: readonly [];
}>;

export function sanitizeN8nWorkflow(
  workflow: N8nWorkflowExport,
): SanitizedWorkflow {
  const secretPaths = scanInlineSecretPaths(workflow);
  if (secretPaths.length > 0) {
    throw new N8nIngestionError(
      "INLINE_SECRET_DETECTED",
      "Workflow contains suspected inline secrets. Remove them before importing.",
      { jsonPaths: secretPaths },
    );
  }

  const clone = structuredClone(workflow);
  let credentialReferencesRemoved = 0;
  for (const node of clone.nodes) {
    if (node.credentials) {
      credentialReferencesRemoved += Object.keys(node.credentials).length;
      delete node.credentials;
    }
    delete node.notes;
    delete node.notesInFlow;
  }
  delete clone.pinData;
  delete clone.staticData;
  delete clone.meta;
  delete clone.tags;

  return {
    workflow: clone,
    credentialReferencesRemoved,
    inlineSecretPaths: [],
  };
}
