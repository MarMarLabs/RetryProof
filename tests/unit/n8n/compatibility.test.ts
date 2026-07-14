import { describe, expect, it } from "vitest";

import {
  N8N_NODE_TYPES,
  analyzeN8nCompatibility,
  type N8nNode,
} from "@/lib/n8n";

import { makeSupportedWorkflow } from "./fixtures";

function codeNode(id: string, name: string): N8nNode {
  return {
    id,
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [0, 400],
    parameters: { jsCode: "return items" },
  };
}

describe("tested-path compatibility", () => {
  it("allows the fully supported refund path", () => {
    const report = analyzeN8nCompatibility(makeSupportedWorkflow());
    expect(report.canExecute).toBe(true);
    expect(report.coverage).toEqual({ supported: 6, total: 6, ratio: 1 });
    expect(report.blockingNodeIds).toEqual([]);
  });

  it("reports but does not block a disconnected unsupported node", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes.push(codeNode("orphan-code", "Orphan code"));
    const report = analyzeN8nCompatibility(workflow);
    expect(report.coverage).toEqual({ supported: 6, total: 7, ratio: 6 / 7 });
    expect(report.nodes.find((node) => node.nodeId === "orphan-code")?.supported).toBe(false);
    expect(report.blockingNodeIds).toEqual([]);
    expect(report.canExecute).toBe(true);
  });

  it("blocks an unsupported node reachable on the tested path", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes.push(codeNode("connected-code", "Connected code"));
    workflow.connections.Respond = {
      main: [[{ node: "Connected code", type: "main", index: 0 }]],
    };
    const report = analyzeN8nCompatibility(workflow);
    expect(report.blockingNodeIds).toEqual(["connected-code"]);
    expect(report.canExecute).toBe(false);
  });

  it("limits blocking to nodes that can reach an explicitly selected target", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes.push(codeNode("side-branch", "Side branch"));
    workflow.connections["Is refund"].main[1] = [
      { node: "Side branch", type: "main", index: 0 },
    ];

    const selected = analyzeN8nCompatibility(workflow, {
      targetNodeIds: ["http_refund"],
    });
    expect(selected.testedPathNodeIds).not.toContain("side-branch");
    expect(selected.canExecute).toBe(true);

    const entireReachableGraph = analyzeN8nCompatibility(workflow);
    expect(entireReachableGraph.blockingNodeIds).toEqual(["side-branch"]);
    expect(entireReachableGraph.canExecute).toBe(false);
  });

  it("fails closed when entry or target selection is invalid", () => {
    const workflow = makeSupportedWorkflow();
    const noWebhook = structuredClone(workflow);
    noWebhook.nodes[0].type = N8N_NODE_TYPES.set;
    noWebhook.nodes[0].typeVersion = 3.4;
    noWebhook.nodes[0].parameters = { mode: "manual" };
    expect(analyzeN8nCompatibility(noWebhook)).toMatchObject({
      canExecute: false,
      graphIssues: [{ code: "NO_ENTRY_NODE" }],
    });

    expect(
      analyzeN8nCompatibility(workflow, { targetNodeIds: ["missing"] }),
    ).toMatchObject({
      canExecute: false,
      graphIssues: [{ code: "UNKNOWN_TARGET_NODE", nodeId: "missing" }],
    });
  });

  it("blocks a supported node whose parameters contain an unsupported expression", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[4].parameters.body = "prefix {{ $json.event.id }}";
    const report = analyzeN8nCompatibility(workflow);
    expect(report.blockingNodeIds).toEqual(["http_refund"]);
    expect(report.canExecute).toBe(false);
  });

  it("fails closed on fan-out that the deterministic IR cannot represent", () => {
    const workflow = makeSupportedWorkflow();
    workflow.connections["Is refund"].main[0]!.push({
      node: "Respond",
      type: "main",
      index: 0,
    });
    expect(analyzeN8nCompatibility(workflow)).toMatchObject({
      canExecute: false,
      graphIssues: expect.arrayContaining([
        { code: "FAN_OUT_UNSUPPORTED", nodeId: "if" },
      ]),
    });
  });

  it("fails closed when a tested-path control is disabled", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[3]!.disabled = true;
    const report = analyzeN8nCompatibility(workflow);
    expect(report.blockingNodeIds).toContain("reservation");
    expect(report.canExecute).toBe(false);
  });
});
