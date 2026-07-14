import {
  findUnsupportedExpressions,
} from "./expressions";
import type { N8nNode } from "./types";

export const N8N_NODE_TYPES = {
  webhook: "n8n-nodes-base.webhook",
  set: "n8n-nodes-base.set",
  if: "n8n-nodes-base.if",
  switch: "n8n-nodes-base.switch",
  httpRequest: "n8n-nodes-base.httpRequest",
  postgres: "n8n-nodes-base.postgres",
  respondToWebhook: "n8n-nodes-base.respondToWebhook",
} as const;

export type SupportedNodeKind = keyof typeof N8N_NODE_TYPES;

export const POSTGRES_RESERVATION_QUERY = `
INSERT INTO retryproof_idempotency_reservations
  (workflow_id, invariant_id, entity_key)
VALUES ($1, $2, $3)
ON CONFLICT (workflow_id, invariant_id, entity_key) DO NOTHING
RETURNING entity_key
`.trim();

export type NodeContract = Readonly<{
  kind: SupportedNodeKind;
  type: (typeof N8N_NODE_TYPES)[SupportedNodeKind];
  versions: readonly number[];
}>;

const CONTRACTS: readonly NodeContract[] = [
  { kind: "webhook", type: N8N_NODE_TYPES.webhook, versions: [2, 2.1] },
  { kind: "set", type: N8N_NODE_TYPES.set, versions: [3.3, 3.4] },
  { kind: "if", type: N8N_NODE_TYPES.if, versions: [2, 2.1, 2.2] },
  { kind: "switch", type: N8N_NODE_TYPES.switch, versions: [3, 3.1, 3.2] },
  { kind: "httpRequest", type: N8N_NODE_TYPES.httpRequest, versions: [4.1, 4.2] },
  { kind: "postgres", type: N8N_NODE_TYPES.postgres, versions: [2.5, 2.6] },
  {
    kind: "respondToWebhook",
    type: N8N_NODE_TYPES.respondToWebhook,
    versions: [1.3, 1.4],
  },
];

const CONTRACT_BY_TYPE: ReadonlyMap<string, NodeContract> = new Map(
  CONTRACTS.map((contract) => [contract.type, contract]),
);

export type NodeCompatibilityCode =
  | "UNSUPPORTED_NODE_TYPE"
  | "UNSUPPORTED_NODE_VERSION"
  | "UNSUPPORTED_EXPRESSION"
  | "INVALID_NODE_PARAMETERS"
  | "UNSAFE_POSTGRES_QUERY"
  | "DISABLED_NODE";

export type NodeCompatibilityIssue = Readonly<{
  code: NodeCompatibilityCode;
  jsonPath: string;
}>;

export type NodeCompatibility = Readonly<{
  nodeId: string;
  nodeName: string;
  kind?: SupportedNodeKind;
  supported: boolean;
  issues: readonly NodeCompatibilityIssue[];
}>;

export type SupportedIfCondition = Readonly<{
  left: unknown;
  right?: unknown;
  operator: "equals" | "not_equals" | "exists";
}>;

export function supportedIfCondition(node: N8nNode): SupportedIfCondition | null {
  if (node.type !== N8N_NODE_TYPES.if) return null;
  const conditions = node.parameters.conditions;
  if (conditions === null || typeof conditions !== "object" || Array.isArray(conditions)) {
    return null;
  }
  const record = conditions as Record<string, unknown>;
  const legacy = record.string;
  if (Array.isArray(legacy) && legacy.length === 1) {
    const item = legacy[0];
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const value = item as Record<string, unknown>;
    if (value.operation === "isNotEmpty" && value.value1 !== undefined) {
      return { left: value.value1, operator: "exists" };
    }
    if (
      (value.operation === "equals" || value.operation === "notEquals") &&
      value.value1 !== undefined &&
      value.value2 !== undefined
    ) {
      return {
        left: value.value1,
        right: value.value2,
        operator: value.operation === "equals" ? "equals" : "not_equals",
      };
    }
    return null;
  }

  const current = record.conditions;
  if (!Array.isArray(current) || current.length !== 1) return null;
  const item = current[0];
  if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  const value = item as Record<string, unknown>;
  const operator = value.operator;
  if (operator === null || typeof operator !== "object" || Array.isArray(operator)) return null;
  const operation = (operator as Record<string, unknown>).operation;
  if (operation === "isNotEmpty" && value.leftValue !== undefined) {
    return { left: value.leftValue, operator: "exists" };
  }
  if (
    (operation === "equals" || operation === "notEquals") &&
    value.leftValue !== undefined &&
    value.rightValue !== undefined
  ) {
    return {
      left: value.leftValue,
      right: value.rightValue,
      operator: operation === "equals" ? "equals" : "not_equals",
    };
  }
  return null;
}

function normalizedSql(value: string): string {
  return value.trim().replace(/;$/, "").replace(/\s+/g, " ").toLowerCase();
}

export function isRetryProofPostgresReservation(node: N8nNode): boolean {
  if (node.type !== N8N_NODE_TYPES.postgres) return false;
  const operation = node.parameters.operation;
  const query = node.parameters.query;
  const options = node.parameters.options;
  if (
    operation !== "executeQuery" ||
    typeof query !== "string" ||
    normalizedSql(query) !== normalizedSql(POSTGRES_RESERVATION_QUERY) ||
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    return false;
  }

  const replacements = (options as Record<string, unknown>).queryReplacement;
  if (typeof replacements !== "string") return false;
  return replacements.trim() === "={{ $json.retryProofReservationValues }}";
}

function parameterIssues(node: N8nNode, kind: SupportedNodeKind): NodeCompatibilityIssue[] {
  const issues: NodeCompatibilityIssue[] = [];
  const parameters = node.parameters;

  for (const unsupported of findUnsupportedExpressions(parameters, "$.parameters")) {
    issues.push({ code: "UNSUPPORTED_EXPRESSION", jsonPath: unsupported.jsonPath });
  }

  if (kind === "webhook") {
    const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    if (
      typeof parameters.httpMethod !== "string" ||
      !allowedMethods.has(parameters.httpMethod) ||
      typeof parameters.path !== "string" ||
      parameters.path.length === 0 ||
      parameters.path.includes("{{")
    ) {
      issues.push({ code: "INVALID_NODE_PARAMETERS", jsonPath: "$.parameters" });
    }
  }

  if (kind === "set" && parameters.mode !== undefined && parameters.mode !== "manual") {
    issues.push({ code: "INVALID_NODE_PARAMETERS", jsonPath: "$.parameters.mode" });
  }

  if (kind === "if" && !supportedIfCondition(node)) {
    issues.push({ code: "INVALID_NODE_PARAMETERS", jsonPath: "$.parameters.conditions" });
  }

  if (kind === "switch" && (parameters.rules === null || typeof parameters.rules !== "object")) {
    issues.push({ code: "INVALID_NODE_PARAMETERS", jsonPath: "$.parameters.rules" });
  }

  if (kind === "httpRequest") {
    const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
    if (
      typeof parameters.method !== "string" ||
      !allowedMethods.has(parameters.method) ||
      typeof parameters.url !== "string" ||
      parameters.url.length === 0
    ) {
      issues.push({ code: "INVALID_NODE_PARAMETERS", jsonPath: "$.parameters" });
    }
  }

  if (kind === "postgres" && !isRetryProofPostgresReservation(node)) {
    issues.push({ code: "UNSAFE_POSTGRES_QUERY", jsonPath: "$.parameters.query" });
  }

  return issues;
}

export function inspectNodeCompatibility(node: N8nNode): NodeCompatibility {
  const contract = CONTRACT_BY_TYPE.get(node.type);
  if (!contract) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      supported: false,
      issues: [{ code: "UNSUPPORTED_NODE_TYPE", jsonPath: "$.type" }],
    };
  }

  const issues: NodeCompatibilityIssue[] = [];
  if (node.disabled === true) {
    issues.push({ code: "DISABLED_NODE", jsonPath: "$.disabled" });
  }
  if (!contract.versions.includes(node.typeVersion)) {
    issues.push({ code: "UNSUPPORTED_NODE_VERSION", jsonPath: "$.typeVersion" });
  }
  issues.push(...parameterIssues(node, contract.kind));

  return {
    nodeId: node.id,
    nodeName: node.name,
    kind: contract.kind,
    supported: issues.length === 0,
    issues,
  };
}

export function listSupportedNodeContracts(): readonly NodeContract[] {
  return CONTRACTS;
}
