import {
  workflowSnapshotSchema,
  type Expression,
  type JsonValue,
  type WorkflowNode,
  type WorkflowSnapshot,
} from "@/domain";
import {
  isRetryProofPostgresReservation,
  N8N_NODE_TYPES,
  parseNarrowExpression,
  supportedIfCondition,
  type CanonicalN8nWorkflow,
  type N8nNode,
  type N8nWorkflowExport,
} from "@/lib/n8n";
import { simulationFixtureSchema, type SimulationFixture } from "@/lib/simulator";

import { LabHttpError } from "./session";

function expression(value: unknown): Expression {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const parsed = parseNarrowExpression(value);
    if (!parsed.supported) {
      throw new LabHttpError("UNSUPPORTED_EXPRESSION", "The tested path contains an unsupported expression.", 422);
    }
    if (parsed.expression.kind === "literal") return parsed.expression;
    return { kind: "json_path", path: parsed.expression.jsonPath.replace(/^\$json/, "$") };
  }
  throw new LabHttpError("UNSUPPORTED_EXPRESSION", "Only literal and JSON-path expressions are supported.", 422);
}

function flattenAssignments(
  value: unknown,
  path = "$",
): Array<{ targetPath: string; value: Expression }> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ targetPath: path, value: expression(value) }];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenAssignments(child, `${path}.${key}`),
  );
}

function setAssignments(node: N8nNode): Array<{ targetPath: string; value: Expression }> {
  const assignments = node.parameters.assignments as
    | { assignments?: Array<{ name?: unknown; value?: unknown }> }
    | undefined;
  if (Array.isArray(assignments?.assignments)) {
    return assignments.assignments.flatMap((assignment) => {
      if (
        typeof assignment.name !== "string" ||
        assignment.name.length === 0 ||
        assignment.name === "retryProofReservationValues"
      ) {
        return [];
      }
      return [{
        targetPath: assignment.name.startsWith("$")
          ? assignment.name
          : `$.${assignment.name}`,
        value: expression(assignment.value),
      }];
    });
  }

  const values = node.parameters.values ?? { result: "acknowledged" };
  return flattenAssignments(values).filter((item) => item.targetPath !== "$");
}

function outputTarget(
  workflow: N8nWorkflowExport,
  node: N8nNode,
  outputIndex = 0,
): string | null {
  const targetName = workflow.connections[node.name]?.main[outputIndex]?.[0]?.node;
  if (!targetName) return null;
  return workflow.nodes.find((candidate) => candidate.name === targetName)?.id ?? null;
}

function httpRoute(node: N8nNode): { routeId: string; path: string } {
  const url = String(node.parameters.url ?? "");
  if (url.startsWith("mock://")) {
    const parsed = new URL(url);
    const routeName = `${parsed.hostname}${parsed.pathname}`.replace(/[^A-Za-z0-9_.:-]/g, "_");
    const path = parsed.pathname === "/" ? `/${parsed.hostname}` : parsed.pathname || `/${parsed.hostname}`;
    return { routeId: `${routeName}_create`, path };
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || "/";
    return {
      routeId: `${parsed.hostname.replace(/[^A-Za-z0-9_.:-]/g, "_")}${path.replace(/[^A-Za-z0-9_.:-]/g, "_")}`,
      path,
    };
  } catch {
    throw new LabHttpError("INVALID_HTTP_ROUTE", "HTTP Request nodes require a valid mock route URL.", 422, {
      nodeId: node.id,
    });
  }
}

function mappedBody(value: unknown): Record<string, Expression> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, expression(child)]),
  );
}

function toNode(workflow: N8nWorkflowExport, node: N8nNode): WorkflowNode {
  const next = outputTarget(workflow, node);
  switch (node.type) {
    case N8N_NODE_TYPES.webhook:
      return { id: node.id, name: node.name, type: "webhook", next };
    case N8N_NODE_TYPES.set: {
      const assignments = setAssignments(node);
      return {
        id: node.id,
        name: node.name,
        type: "set",
        assignments: assignments.length > 0 ? assignments : [{ targetPath: "$.result", value: { kind: "literal", value: "ok" } }],
        next,
      };
    }
    case N8N_NODE_TYPES.if: {
      const condition = supportedIfCondition(node);
      if (!condition) {
        throw new LabHttpError(
          "UNSUPPORTED_IF_SHAPE",
          "IF nodes require exactly one supported declarative condition.",
          422,
          { nodeId: node.id },
        );
      }
      const left = expression(condition.left);
      return {
        id: node.id,
        name: node.name,
        type: "if",
        condition: condition.operator === "exists"
          ? { left, operator: "exists" }
          : {
              left,
              operator: condition.operator,
              right: expression(condition.right),
            },
        whenTrue: outputTarget(workflow, node, 0),
        whenFalse: outputTarget(workflow, node, 1),
      };
    }
    case N8N_NODE_TYPES.switch: {
      const rules = node.parameters.rules as
        | {
            values?: Array<{
              conditions?: {
                conditions?: Array<{ leftValue?: unknown; rightValue?: unknown }>;
              };
            }>;
          }
        | undefined;
      const values = rules?.values ?? [];
      const firstCondition = values[0]?.conditions?.conditions?.[0];
      if (!firstCondition || values.length === 0) {
        throw new LabHttpError(
          "UNSUPPORTED_SWITCH_SHAPE",
          "Switch rules require simple equality conditions for deterministic translation.",
          422,
          { nodeId: node.id },
        );
      }
      return {
        id: node.id,
        name: node.name,
        type: "switch",
        value: expression(firstCondition.leftValue),
        cases: values.map((rule, index) => {
          const condition = rule.conditions?.conditions?.[0];
          const target = outputTarget(workflow, node, index);
          if (!condition || !target) {
            throw new LabHttpError(
              "UNSUPPORTED_SWITCH_SHAPE",
              "Every Switch rule requires one equality condition and one connected output.",
              422,
              { nodeId: node.id },
            );
          }
          return { equals: expression(condition.rightValue), next: target };
        }),
        defaultNext: outputTarget(workflow, node, values.length),
      };
    }
    case N8N_NODE_TYPES.httpRequest: {
      const route = httpRoute(node);
      const method = String(node.parameters.method ?? "GET") as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      const body = mappedBody(node.parameters.body ?? node.parameters.jsonBody);
      const key = body.event_id ?? expression("={{ $json.event.id }}");
      return {
        id: node.id,
        name: node.name,
        type: "http_request",
        method,
        routeId: route.routeId,
        path: route.path,
        body,
        ...(method === "GET" ? {} : { effect: { id: route.path.split("/").filter(Boolean).at(-1) ?? "effect", key } }),
        next,
      };
    }
    case N8N_NODE_TYPES.postgres:
      if (!isRetryProofPostgresReservation(node)) {
        throw new LabHttpError("UNSAFE_POSTGRES_QUERY", "Only RetryProof's reservation contract is allowed.", 422, {
          nodeId: node.id,
        });
      }
      const decisionId = outputTarget(workflow, node, 0);
      const decision = workflow.nodes.find(
        (candidate) => candidate.id === decisionId && candidate.type === N8N_NODE_TYPES.if,
      );
      return {
        id: node.id,
        name: node.name,
        type: "reservation",
        namespace: String(node.parameters.namespace ?? "refunds"),
        key: expression("={{ $json.event.id }}"),
        acquiredNext: decision
          ? outputTarget(workflow, decision, 0)
          : outputTarget(workflow, node, 0),
        conflictNext: decision
          ? outputTarget(workflow, decision, 1)
          : outputTarget(workflow, node, 1),
      };
    case N8N_NODE_TYPES.respondToWebhook:
      return {
        id: node.id,
        name: node.name,
        type: "respond",
        status: Number(node.parameters.responseCode ?? 200),
        body: { status: expression(node.parameters.responseBody ?? "acknowledged") },
      };
    default:
      throw new LabHttpError("UNSUPPORTED_NODE_ON_PATH", "The tested path contains an unsupported node.", 422, {
        nodeId: node.id,
      });
  }
}

export function toSimulatorWorkflow(
  workflow: N8nWorkflowExport,
  id: string,
): WorkflowSnapshot {
  const entry = workflow.nodes.find((node) => node.type === N8N_NODE_TYPES.webhook);
  if (!entry) throw new LabHttpError("NO_ENTRY_NODE", "A supported Webhook entry node is required.", 422);
  return workflowSnapshotSchema.parse({
    schemaVersion: "1",
    id,
    name: workflow.name,
    entryNodeId: entry.id,
    nodes: workflow.nodes.map((node) => toNode(workflow, node)),
  });
}

export function fixtureForWorkflow(
  canonical: CanonicalN8nWorkflow,
  fixtureInput: Record<string, unknown>,
  id: string,
): SimulationFixture {
  const alreadyFixture = simulationFixtureSchema.safeParse(fixtureInput);
  if (alreadyFixture.success) return alreadyFixture.data;
  const httpMocks = canonical.nodes
    .filter((node) => node.type === N8N_NODE_TYPES.httpRequest)
    .map((node) => {
      const route = httpRoute(node as N8nNode);
      return {
        routeId: route.routeId,
        method: String(node.parameters.method ?? "GET") as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: route.path,
        status: 201,
        responseBody: { status: "created" },
      };
    });
  return simulationFixtureSchema.parse({
    schemaVersion: "1",
    id,
    input: fixtureInput as Record<string, JsonValue>,
    httpMocks,
  });
}
