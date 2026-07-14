import type { RiskPlan } from "./schemas";
import { jsonPath } from "@/domain";

type CanonicalNode = {
  id: string;
  parameters?: unknown;
  [key: string]: unknown;
};

export class GroundingError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "GroundingError";
  }
}

function pathExists(value: unknown, path: string): boolean {
  if (!path.startsWith("$")) return false;
  const parts = path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cursor: unknown = value;
  for (const part of parts) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      !Object.hasOwn(cursor, part)
    ) return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return true;
}

function effectIdForNode(node: CanonicalNode): string | null {
  if (node.parameters === null || typeof node.parameters !== "object") return null;
  const url = (node.parameters as Record<string, unknown>).url;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).at(-1) ?? (parsed.hostname || null);
  } catch {
    return null;
  }
}

function graphNodeIdAtPath(
  path: string,
  canonicalGraph: { nodes: CanonicalNode[] },
): string | undefined {
  const match = /^\$(?:\.canonicalGraph)?\.nodes\[(\d+)\](?:\.|$)/.exec(path);
  if (!match) return undefined;
  return canonicalGraph.nodes[Number(match[1])]?.id;
}

export function validatePlanGrounding(
  plan: RiskPlan,
  canonicalGraph: { nodes: CanonicalNode[]; [key: string]: unknown },
  fixtureShape?: unknown,
): RiskPlan {
  const nodeIds = new Set(canonicalGraph.nodes.map((node) => node.id));
  const evidenceContext = { canonicalGraph, fixtureShape };
  const issues: string[] = [];

  const evidencePathExists = (path: string) =>
    path.startsWith("$.canonicalGraph.") || path.startsWith("$.fixtureShape.")
      ? pathExists(evidenceContext, path)
      : pathExists(canonicalGraph, path);

  for (const sideEffect of plan.sideEffects) {
    if (!nodeIds.has(sideEffect.nodeId)) {
      issues.push(`Side effect ${sideEffect.id} cites unknown node ${sideEffect.nodeId}.`);
    }
    for (const evidence of sideEffect.evidence) {
      if (!nodeIds.has(evidence.nodeId)) {
        issues.push(`Evidence cites unknown node ${evidence.nodeId}.`);
      }
      if (!evidencePathExists(evidence.jsonPath)) {
        issues.push(`Evidence path does not exist: ${evidence.jsonPath}.`);
      }
      const pathNodeId = graphNodeIdAtPath(evidence.jsonPath, canonicalGraph);
      if (pathNodeId !== undefined && pathNodeId !== evidence.nodeId) {
        issues.push(`Evidence path ${evidence.jsonPath} does not describe node ${evidence.nodeId}.`);
      }
    }
    for (const candidate of sideEffect.keyCandidates) {
      if (candidate.evidencePaths.some((path) => !evidencePathExists(path))) {
        issues.push(`Key candidate ${candidate.jsonPath} contains an absent evidence path.`);
      }
      if (
        candidate.evidencePaths.some((path) => {
          const pathNodeId = graphNodeIdAtPath(path, canonicalGraph);
          return pathNodeId !== undefined && pathNodeId !== sideEffect.nodeId;
        })
      ) {
        issues.push(`Key candidate ${candidate.jsonPath} cites a different graph node.`);
      }
    }
  }

  for (const invariant of plan.invariants) {
    const citedNodes = invariant.sourceNodeIds
      .map((nodeId) => canonicalGraph.nodes.find((node) => node.id === nodeId))
      .filter((node): node is CanonicalNode => Boolean(node));
    for (const nodeId of invariant.sourceNodeIds) {
      if (!nodeIds.has(nodeId)) issues.push(`Invariant ${invariant.id} cites unknown node ${nodeId}.`);
    }
    const citedEffectIds = citedNodes
      .map(effectIdForNode)
      .filter((effectId): effectId is string => Boolean(effectId));
    if (!citedEffectIds.includes(invariant.oracle.effectId)) {
      issues.push(
        `Invariant ${invariant.id} effect ID is not bound to a cited HTTP node.`,
      );
    }
    if (
      !jsonPath.safeParse(invariant.oracle.keyPath).success ||
      invariant.oracle.keyPath !== "$.key"
    ) {
      issues.push(`Invariant ${invariant.id} must count the ledger's bound effect key.`);
    }
  }

  for (const scenario of plan.scenarios) {
    if (!nodeIds.has(scenario.targetNodeId)) {
      issues.push(`Scenario ${scenario.id} targets unknown node ${scenario.targetNodeId}.`);
    }
    for (const invariantId of scenario.expectedInvariantIds) {
      if (!plan.invariants.some((invariant) => invariant.id === invariantId)) {
        issues.push(`Scenario ${scenario.id} cites unknown invariant ${invariantId}.`);
      }
    }
  }

  if (issues.length > 0) throw new GroundingError("The model plan was not grounded in the workflow.", issues);
  return plan;
}
