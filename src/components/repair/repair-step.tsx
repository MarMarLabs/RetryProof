"use client";

import { Check, Code2, FileArchive, ShieldCheck, Sparkles } from "lucide-react";
import { WorkflowGraph } from "@/components/graph/workflow-graph";
import type { RepairResource, WorkflowResource } from "@/features/lab/api-client";
import type { WorkflowNodeView } from "@/features/lab/types";

export function RepairStep({
  approved,
  busy,
  onApprove,
  repair,
  workflow,
  nodes,
}: {
  approved: boolean;
  busy: boolean;
  onApprove: () => void;
  repair: RepairResource;
  workflow: WorkflowResource;
  nodes: WorkflowNodeView[];
}) {
  const proposal = repair.proposal;
  const bytes = (value: unknown): string => {
    const size = new TextEncoder().encode(
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    ).byteLength;
    return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  };
  const artifacts = [
    ["repair.patch.json", bytes(proposal.patch)],
    ["regression-fixture.json", bytes(proposal.regressionFixture)],
    ["repair-manifest.json", bytes(proposal.manifest)],
    ["README.md", bytes(proposal.readme)],
  ];
  const checkLabels = {
    source_hash_bound: "Source hash bound",
    patch_structure_valid: "Patch structure validated",
    credential_scan_clear: "Credential scan clear",
    source_fixture_failed: "Regression fixture failed on source",
    repaired_fixture_passed: "Regression fixture passed after repair",
  } as const;
  const addedNodes = proposal.patch.flatMap((operation): WorkflowNodeView[] => {
    if (
      operation.op !== "add" ||
      operation.path !== "/nodes/-" ||
      !operation.value ||
      typeof operation.value !== "object"
    ) return [];
    const value = operation.value as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.type !== "string") {
      return [];
    }
    return [{
      id: value.id,
      label: value.name,
      detail: value.type.replace("n8n-nodes-base.", ""),
      kind: value.type.endsWith(".postgres") ? "reservation" : value.type.endsWith(".if") ? "decision" : "transform",
    }];
  });
  const effectNodeId = proposal.regressionFixture.invariant.sourceNodeIds[0];
  const effectIndex = nodes.findIndex((node) => node.id === effectNodeId);
  const patchedNodes = effectIndex < 0
    ? [...nodes, ...addedNodes]
    : [...nodes.slice(0, effectIndex), ...addedNodes, ...nodes.slice(effectIndex)];
  const reservationNodeId = addedNodes.find((node) => node.kind === "reservation")?.id;
  return (
    <section className="repair-view" aria-labelledby="repair-heading">
      <header className="section-heading section-heading--compact">
        <div><p className="eyeline">Bounded repair · source {workflow.sourceHash.slice(0, 8)}…</p><h1 id="repair-heading">Review the Codex repair.</h1></div>
        <span className="model-provenance"><Sparkles size={15} aria-hidden="true" /> {proposal.provenance.mode === "live" ? "Live Codex repair" : "Cached demo repair"} · live validator</span>
      </header>
      <div className="repair-grid">
        <article className="repair-review">
          <div className="repair-strategy"><ShieldCheck size={24} aria-hidden="true" /><div><strong>{proposal.manifest.strategy.replaceAll("_", " ")}</strong><p>{proposal.explanation}</p></div></div>
          <div className="panel-title"><span>Graph diff · RFC 6902</span><span className="mono">{proposal.patch.length} operations</span></div>
          <pre className="code-diff" tabIndex={0}>{JSON.stringify(proposal.patch, null, 2)}</pre>
          <div className="artifact-list" aria-label="Generated artifacts">
            {artifacts.map(([name, size]) => <div key={name}><FileArchive size={15} aria-hidden="true" /><span>{name}</span><small>{size}</small></div>)}
          </div>
        </article>
        <article className="repair-preview">
          <div className="panel-title"><span>Patched workflow preview</span><span className="mono">validator passed</span></div>
          <WorkflowGraph nodes={patchedNodes} selectedNodeId={reservationNodeId} repaired />
          <div className="validation-list">
            {repair.regressionValidation.checks.map((check) => (
              <div key={check}><Check size={15} aria-hidden="true" /><span>{checkLabels[check]}</span></div>
            ))}
          </div>
          <div className="human-gate">
            <Code2 size={22} aria-hidden="true" />
            <div><strong>Human approval required</strong><p>The original upload is untouched. Approval validates this ephemeral patch against the identical fault suite.</p></div>
          </div>
          <button className="button button--success" disabled={approved || busy} onClick={onApprove}>
            <Check size={17} aria-hidden="true" /> {approved ? "Patch approved" : "Approve and verify"}
          </button>
        </article>
      </div>
    </section>
  );
}
