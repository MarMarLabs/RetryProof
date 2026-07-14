import jsonPatch from "fast-json-patch";
import { createHash } from "node:crypto";
import {
  ingestN8nWorkflow,
  isRetryProofPostgresReservation,
  N8N_NODE_TYPES,
  N8nWorkflowExportSchema,
  scanInlineSecretPaths,
  stableStringify,
  type N8nNode,
  type N8nWorkflowExport,
} from "@/lib/n8n";
import {
  RepairProposalSchema,
  type RegressionFixture,
  type RepairProposal,
} from "./schemas";

const { applyPatch, deepClone } = jsonPatch;

const SENSITIVE_KEY = /(?:authorization|api[-_]?key|secret|password|token|credential)/i;
const STRONG_SECRET_VALUE = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/-]{20,})/i;
const ALLOWED_EXISTING_NODE_PATH = /^\/nodes\/\d+\/parameters\/(?:assignments\/assignments\/-|headerParameters)$/;
const ALLOWED_CONNECTION_EDGE_PATH = /^\/connections\/[^/]+\/main\/\d+\/\d+\/node$/;
const ALLOWED_CONNECTION_ROOT_PATH = /^\/connections\/[^/]+$/;
const RESERVATION_NODE_KEYS = new Set([
  "alwaysOutputData",
  "id",
  "name",
  "parameters",
  "position",
  "type",
  "typeVersion",
]);
const BRANCH_NODE_KEYS = new Set([
  "id",
  "name",
  "parameters",
  "position",
  "type",
  "typeVersion",
]);

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function newNodeShapeIssue(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "New repair nodes must be JSON objects.";
  }
  const node = value as Record<string, unknown>;
  const allowed = node.type === N8N_NODE_TYPES.postgres
    ? RESERVATION_NODE_KEYS
    : node.type === N8N_NODE_TYPES.if
      ? BRANCH_NODE_KEYS
      : null;
  if (!allowed) return "Repair may add only the supported reservation and decision nodes.";
  const unexpected = Object.keys(node).filter((key) => !allowed.has(key));
  return unexpected.length > 0
    ? `New repair node contains undeclared runtime fields: ${unexpected.sort().join(", ")}.`
    : null;
}

function changedNodeIdsForPatch(
  source: N8nWorkflowExport,
  patch: RepairProposal["patch"],
): string[] {
  const ids = new Set<string>();
  const nodesByName = new Map(source.nodes.map((node) => [node.name, node.id]));
  for (const operation of patch) {
    const nodeMatch = /^\/nodes\/(\d+)(?:\/|$)/.exec(operation.path);
    if (nodeMatch) {
      const id = source.nodes[Number(nodeMatch[1])]?.id;
      if (id) ids.add(id);
    }
    if (operation.path === "/nodes/-" && operation.op !== "remove") {
      const value = operation.value;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const id = (value as Record<string, unknown>).id;
        if (typeof id === "string") ids.add(id);
      }
    }
    const connectionMatch = /^\/connections\/([^/]+)(?:\/|$)/.exec(operation.path);
    if (connectionMatch) {
      const sourceId = nodesByName.get(decodeJsonPointerSegment(connectionMatch[1]!));
      if (sourceId) ids.add(sourceId);
    }
  }
  return [...ids].sort();
}

export class PatchValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("The repair patch failed validation.");
    this.name = "PatchValidationError";
  }
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function containsCredential(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return STRONG_SECRET_VALUE.test(value) ? [path] : [];
  }
  if (value === null || typeof value !== "object") return [];
  const issues: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY.test(key) && child !== null && child !== "") {
      issues.push(childPath);
    }
    issues.push(...containsCredential(child, childPath));
  }
  return issues;
}

function operationPathIssue(operation: RepairProposal["patch"][number]): string | null {
  if (operation.op === "remove") return "Repair patches may not remove workflow content.";
  if (operation.path === "/nodes/-") return null;
  if (ALLOWED_EXISTING_NODE_PATH.test(operation.path)) return null;
  if (
    operation.op === "replace" &&
    ALLOWED_CONNECTION_EDGE_PATH.test(operation.path) &&
    typeof operation.value === "string"
  ) return null;
  if (operation.op === "add" && ALLOWED_CONNECTION_ROOT_PATH.test(operation.path)) return null;
  return `Disallowed repair operation path: ${operation.path}`;
}

function connectionRepairIssues(
  source: N8nWorkflowExport,
  patched: N8nWorkflowExport,
  effectNodeIds: readonly string[] | undefined,
): string[] {
  const issues: string[] = [];
  const sourceIds = new Set(source.nodes.map((node) => node.id));
  const newNodes = patched.nodes.filter((node) => !sourceIds.has(node.id));
  const reservation = newNodes.filter(isRetryProofPostgresReservation);
  const branch = newNodes.filter((node) => node.type === N8N_NODE_TYPES.if);
  if (newNodes.length !== 2 || reservation.length !== 1 || branch.length !== 1) {
    return ["Repair must add exactly one reservation node and one decision branch."];
  }
  if (source.nodes.some((node) => !patched.nodes.some((item) => item.id === node.id))) {
    issues.push("Repair may not remove an existing workflow node.");
  }
  const protectedEffects = source.nodes.filter(
    (node) =>
      node.type === N8N_NODE_TYPES.httpRequest &&
      (!effectNodeIds?.length || effectNodeIds.includes(node.id)),
  );
  const responses = source.nodes.filter(
    (node) => node.type === N8N_NODE_TYPES.respondToWebhook,
  );
  if (protectedEffects.length !== 1 || responses.length !== 1) {
    issues.push("Repair currently requires exactly one approved effect and one response node.");
    return issues;
  }

  const expectedConnections = structuredClone(source.connections);
  for (const connection of Object.values(expectedConnections)) {
    for (const output of connection.main) {
      for (const target of output) {
        if (target.node === protectedEffects[0]!.name) {
          target.node = reservation[0]!.name;
        }
      }
    }
  }
  expectedConnections[reservation[0]!.name] = {
    main: [[{ node: branch[0]!.name, type: "main", index: 0 }]],
  };
  expectedConnections[branch[0]!.name] = {
    main: [
      [{ node: protectedEffects[0]!.name, type: "main", index: 0 }],
      [{ node: responses[0]!.name, type: "main", index: 0 }],
    ],
  };
  if (stableStringify(expectedConnections) !== stableStringify(patched.connections)) {
    issues.push("Repair changes connections outside the approved reservation insertion.");
  }
  return issues;
}

function headerEntries(node: N8nNode): Array<Record<string, unknown>> | null {
  const container = node.parameters.headerParameters;
  if (container === null || typeof container !== "object" || Array.isArray(container)) {
    return null;
  }
  const entries = (container as Record<string, unknown>).parameters;
  if (!Array.isArray(entries) || entries.some((entry) => entry === null || typeof entry !== "object" || Array.isArray(entry))) {
    return null;
  }
  return entries as Array<Record<string, unknown>>;
}

function idempotencyHeaderIssues(source: N8nNode, patched: N8nNode): string[] {
  const entries = headerEntries(patched);
  if (!entries) return ["Approved HTTP effect headers must use parameters.headerParameters.parameters."];
  const idempotency = entries.filter((entry) => entry.name === "Idempotency-Key");
  if (
    idempotency.length !== 1 ||
    idempotency[0]?.value !== "={{ $json.event.id }}"
  ) {
    return ["Approved HTTP effect must contain exactly one event-bound Idempotency-Key header."];
  }
  const sourceEntries = headerEntries(source) ?? [];
  const sourceOthers = sourceEntries.filter((entry) => entry.name !== "Idempotency-Key");
  const patchedOthers = entries.filter((entry) => entry.name !== "Idempotency-Key");
  return stableStringify(sourceOthers) === stableStringify(patchedOthers)
    ? []
    : ["Repair may not alter unrelated HTTP headers."];
}

function graphTargets(workflow: N8nWorkflowExport, sourceName: string): string[] {
  return (workflow.connections[sourceName]?.main ?? [])
    .flat()
    .map((target) => target.node);
}

function hasIncomingEdge(workflow: N8nWorkflowExport, targetName: string): boolean {
  return Object.values(workflow.connections).some((connection) =>
    connection.main.flat().some((target) => target.node === targetName),
  );
}

function semanticRepairIssues(
  source: N8nWorkflowExport,
  workflow: N8nWorkflowExport,
  effectNodeIds: readonly string[] | undefined,
  sourceHash: string,
  approvedInvariantId: string,
): string[] {
  const issues: string[] = [];
  const reservations = workflow.nodes.filter(isRetryProofPostgresReservation);
  if (reservations.length !== 1) {
    issues.push("Repair must contain exactly one supported RetryProof reservation node.");
    return issues;
  }
  const reservation = reservations[0]!;
  if (reservation.alwaysOutputData !== true) {
    issues.push("Reservation node must enable alwaysOutputData so conflicts reach the duplicate branch.");
  }
  if (!hasIncomingEdge(workflow, reservation.name)) {
    issues.push("Reservation node is not connected before the protected effect.");
  }

  const branchNames = graphTargets(workflow, reservation.name);
  const branches = workflow.nodes.filter(
    (node) => branchNames.includes(node.name) && node.type === N8N_NODE_TYPES.if,
  );
  if (branches.length !== 1) {
    issues.push("Reservation node must lead to exactly one supported decision branch.");
  } else {
    const conditions = (branches[0]!.parameters.conditions as {
      conditions?: unknown;
    } | undefined)?.conditions;
    const condition = Array.isArray(conditions) ? conditions[0] : null;
    if (
      !Array.isArray(conditions) ||
      conditions.length !== 1 ||
      condition === null ||
      typeof condition !== "object" ||
      Array.isArray(condition) ||
      (condition as Record<string, unknown>).leftValue !== "={{ $json.entity_key }}" ||
      (condition as Record<string, unknown>).rightValue !== "" ||
      stableStringify((condition as Record<string, unknown>).operator) !==
        stableStringify({ type: "string", operation: "isNotEmpty" })
    ) {
      issues.push("Reservation branch must test the exact reservation entity_key result.");
    }
    const targets = graphTargets(workflow, branches[0]!.name);
    const targetNodes = workflow.nodes.filter((node) => targets.includes(node.name));
    if (!targetNodes.some((node) => node.type === N8N_NODE_TYPES.httpRequest)) {
      issues.push("Reservation branch does not route the acquired path to an HTTP effect.");
    }
    if (!targetNodes.some((node) => node.type === N8N_NODE_TYPES.respondToWebhook)) {
      issues.push("Reservation branch does not route the duplicate path to a response node.");
    }
  }

  const reservationAssignments = workflow.nodes.flatMap((node) => {
    if (node.type !== N8N_NODE_TYPES.set) return [];
    const assignments = (node.parameters.assignments as { assignments?: unknown } | undefined)?.assignments;
    return Array.isArray(assignments)
      ? assignments.filter(
          (assignment): assignment is Record<string, unknown> =>
            assignment !== null &&
            typeof assignment === "object" &&
            !Array.isArray(assignment) &&
            (assignment as Record<string, unknown>).name === "retryProofReservationValues",
        )
      : [];
  });
  const expectedReservationValues = [
    source.id ?? sourceHash,
    approvedInvariantId,
    "={{ $json.event.id }}",
  ];
  if (
    reservationAssignments.length !== 1 ||
    reservationAssignments[0]?.type !== "array" ||
    stableStringify(reservationAssignments[0]?.value) !== stableStringify(expectedReservationValues)
  ) {
    issues.push("Reservation values must bind the source workflow, approved invariant, and event ID exactly.");
  }

  const protectedEffects = workflow.nodes.filter(
    (node) =>
      node.type === N8N_NODE_TYPES.httpRequest &&
      (!effectNodeIds?.length || effectNodeIds.includes(node.id)),
  );
  const sourceById = new Map(source.nodes.map((node) => [node.id, node]));
  if (protectedEffects.length === 0) {
    issues.push("Repair must retain every approved HTTP effect.");
  } else {
    for (const effect of protectedEffects) {
      const sourceEffect = sourceById.get(effect.id);
      if (!sourceEffect) {
        issues.push("Repair may not introduce a new approved HTTP effect.");
        continue;
      }
      issues.push(...idempotencyHeaderIssues(sourceEffect, effect));
    }
  }
  return issues;
}

export function validateRepairProposal(input: {
  proposal: unknown;
  sourceWorkflow: Record<string, unknown>;
  sourceHash: string;
  approvedInvariantId: string;
  effectNodeIds?: readonly string[];
  expectedRegressionFixture: RegressionFixture;
}): { proposal: RepairProposal; patchedWorkflow: Record<string, unknown>; patchedHash: string } {
  const proposal = RepairProposalSchema.parse(input.proposal);
  const issues: string[] = [];
  const sourceWorkflow = N8nWorkflowExportSchema.parse(input.sourceWorkflow);
  if (proposal.manifest.sourceHash !== input.sourceHash) issues.push("Manifest source hash mismatch.");
  if (proposal.manifest.invariantId !== input.approvedInvariantId) issues.push("Manifest invariant mismatch.");
  if (
    stableStringify(proposal.regressionFixture) !==
    stableStringify(input.expectedRegressionFixture)
  ) {
    issues.push("Regression fixture does not match the approved failing fixture and scenarios.");
  }
  const actualChangedNodeIds = changedNodeIdsForPatch(sourceWorkflow, proposal.patch);
  if (
    stableStringify([...proposal.manifest.changedNodeIds].sort()) !==
    stableStringify(actualChangedNodeIds)
  ) {
    issues.push("Manifest changedNodeIds does not match the nodes changed by the patch.");
  }

  for (const operation of proposal.patch) {
    const pathIssue = operationPathIssue(operation);
    if (pathIssue) issues.push(pathIssue);
    if (operation.path === "/nodes/-" && operation.op !== "remove") {
      const shapeIssue = newNodeShapeIssue(operation.value);
      if (shapeIssue) issues.push(shapeIssue);
    }
    const connectionRootMatch = /^\/connections\/([^/]+)$/.exec(operation.path);
    if (
      operation.op === "add" &&
      connectionRootMatch &&
      Object.hasOwn(
        sourceWorkflow.connections,
        decodeJsonPointerSegment(connectionRootMatch[1]!),
      )
    ) {
      issues.push("Connection roots may be added only for new node names.");
    }
    if (operation.op !== "remove" && containsCredential(operation.value).length > 0) {
      issues.push(`Credential-like field added at ${operation.path}.`);
    }
    const assignmentMatch = /^\/nodes\/(\d+)\/parameters\/assignments\/assignments\/-$/.exec(
      operation.path,
    );
    if (
      assignmentMatch &&
      sourceWorkflow.nodes[Number(assignmentMatch[1])]?.type !== N8N_NODE_TYPES.set
    ) {
      issues.push("Reservation values may be added only to an existing Set node.");
    }
    const headerMatch = /^\/nodes\/(\d+)\/parameters\/headerParameters$/.exec(
      operation.path,
    );
    if (headerMatch) {
      const node = sourceWorkflow.nodes[Number(headerMatch[1])];
      if (
        node?.type !== N8N_NODE_TYPES.httpRequest ||
        (input.effectNodeIds?.length && !input.effectNodeIds.includes(node.id))
      ) {
        issues.push("Idempotency headers may be added only to an approved HTTP effect.");
      }
    }
  }

  if (containsCredential(proposal).length > 0) {
    issues.push("Repair proposal contains credential-like fields or secret values.");
  }
  if (scanInlineSecretPaths(proposal).length > 0) {
    issues.push("Repair proposal contains suspected inline secret values.");
  }

  let patchedWorkflow: Record<string, unknown> = deepClone(input.sourceWorkflow);
  try {
    patchedWorkflow = applyPatch(patchedWorkflow, proposal.patch, true, false).newDocument;
  } catch (error) {
    issues.push(`RFC 6902 application failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  if (containsCredential(patchedWorkflow).length > 0) {
    issues.push("Patched workflow contains credential-like inline values.");
  }
  let patchedHash = sha256(patchedWorkflow);
  try {
    const imported = ingestN8nWorkflow(JSON.stringify(patchedWorkflow));
    patchedHash = imported.sourceHash;
    if (!imported.compatibility.canExecute) {
      issues.push("Patched workflow does not pass the pinned n8n compatibility check.");
    }
    issues.push(
      ...semanticRepairIssues(
        sourceWorkflow,
        imported.sanitizedWorkflow,
        input.effectNodeIds,
        input.sourceHash,
        input.approvedInvariantId,
      ),
    );
    issues.push(
      ...connectionRepairIssues(
        sourceWorkflow,
        imported.sanitizedWorkflow,
        input.effectNodeIds,
      ),
    );
  } catch (error) {
    issues.push(
      `Patched workflow does not pass pinned n8n import validation: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  if (issues.length > 0) throw new PatchValidationError(issues);
  return { proposal, patchedWorkflow, patchedHash };
}
