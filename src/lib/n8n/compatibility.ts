import {
  N8N_NODE_TYPES,
  inspectNodeCompatibility,
  type NodeCompatibility,
} from "./catalog";
import type { N8nWorkflowExport } from "./types";

export type CompatibilityOptions = Readonly<{
  entryNodeIds?: readonly string[];
  targetNodeIds?: readonly string[];
}>;

export type CompatibilityGraphIssue = Readonly<{
  code:
    | "NO_ENTRY_NODE"
    | "UNKNOWN_ENTRY_NODE"
    | "UNKNOWN_TARGET_NODE"
    | "TARGET_NOT_REACHABLE"
    | "FAN_OUT_UNSUPPORTED";
  nodeId?: string;
}>;

export type CompatibilityReport = Readonly<{
  coverage: Readonly<{ supported: number; total: number; ratio: number }>;
  nodes: readonly NodeCompatibility[];
  testedPathNodeIds: readonly string[];
  blockingNodeIds: readonly string[];
  graphIssues: readonly CompatibilityGraphIssue[];
  canExecute: boolean;
}>;

function traverse(starts: readonly string[], graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const visited = new Set<string>();
  const pending = [...starts];
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const neighbor of graph.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) pending.push(neighbor);
    }
  }
  return visited;
}

function buildGraphs(workflow: N8nWorkflowExport) {
  const idByName = new Map(workflow.nodes.map((node) => [node.name, node.id]));
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const node of workflow.nodes) {
    forward.set(node.id, new Set());
    reverse.set(node.id, new Set());
  }

  for (const [sourceName, connection] of Object.entries(workflow.connections)) {
    const sourceId = idByName.get(sourceName);
    if (!sourceId) continue;
    for (const output of connection.main) {
      for (const target of output) {
        const targetId = idByName.get(target.node);
        if (!targetId) continue;
        forward.get(sourceId)?.add(targetId);
        reverse.get(targetId)?.add(sourceId);
      }
    }
  }
  return { forward, reverse };
}

/**
 * Unsupported nodes fail closed only when they are on the selected test path.
 * Disconnected editor debris is still reported but cannot silently widen the
 * simulator's declared coverage.
 */
export function analyzeN8nCompatibility(
  workflow: N8nWorkflowExport,
  options: CompatibilityOptions = {},
): CompatibilityReport {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const nodes = workflow.nodes.map(inspectNodeCompatibility);
  const graphIssues: CompatibilityGraphIssue[] = [];

  const defaultEntries = workflow.nodes
    .filter((node) => node.type === N8N_NODE_TYPES.webhook)
    .map((node) => node.id);
  const entries = [...(options.entryNodeIds ?? defaultEntries)];
  if (entries.length === 0) graphIssues.push({ code: "NO_ENTRY_NODE" });
  for (const nodeId of entries) {
    if (!nodeById.has(nodeId)) graphIssues.push({ code: "UNKNOWN_ENTRY_NODE", nodeId });
  }

  const targets = options.targetNodeIds ? [...options.targetNodeIds] : undefined;
  for (const nodeId of targets ?? []) {
    if (!nodeById.has(nodeId)) graphIssues.push({ code: "UNKNOWN_TARGET_NODE", nodeId });
  }

  const validEntries = entries.filter((nodeId) => nodeById.has(nodeId));
  const validTargets = targets?.filter((nodeId) => nodeById.has(nodeId));
  const { forward, reverse } = buildGraphs(workflow);
  const reachable = traverse(validEntries, forward);

  let testedPath = reachable;
  if (validTargets && validTargets.length > 0) {
    const reachesTarget = traverse(validTargets, reverse);
    testedPath = new Set([...reachable].filter((nodeId) => reachesTarget.has(nodeId)));
    for (const target of validTargets) {
      if (!reachable.has(target)) {
        graphIssues.push({ code: "TARGET_NOT_REACHABLE", nodeId: target });
      }
    }
  }

  const idByName = new Map(workflow.nodes.map((node) => [node.name, node.id]));
  for (const [sourceName, connection] of Object.entries(workflow.connections)) {
    const sourceId = idByName.get(sourceName);
    if (
      sourceId &&
      testedPath.has(sourceId) &&
      connection.main.some((output) => output.length > 1)
    ) {
      graphIssues.push({ code: "FAN_OUT_UNSUPPORTED", nodeId: sourceId });
    }
  }

  const blockingNodeIds = nodes
    .filter((node) => !node.supported && testedPath.has(node.nodeId))
    .map((node) => node.nodeId)
    .sort();
  const supported = nodes.filter((node) => node.supported).length;
  const total = nodes.length;

  return {
    coverage: { supported, total, ratio: total === 0 ? 0 : supported / total },
    nodes,
    testedPathNodeIds: [...testedPath].sort(),
    blockingNodeIds,
    graphIssues,
    canExecute:
      graphIssues.length === 0 &&
      testedPath.size > 0 &&
      blockingNodeIds.length === 0,
  };
}
