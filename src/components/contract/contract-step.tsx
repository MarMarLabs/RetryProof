"use client";

import { Check, Eye, Sparkles } from "lucide-react";
import { WorkflowGraph } from "@/components/graph/workflow-graph";
import type { AnalysisResource } from "@/features/lab/api-client";
import type { WorkflowNodeView } from "@/features/lab/types";

export function ContractStep({
  approved,
  checked,
  onChecked,
  busy,
  onApprove,
  analysis,
  nodes,
  statement,
  onStatement,
}: {
  approved: boolean;
  checked: boolean;
  onChecked: (value: boolean) => void;
  busy: boolean;
  onApprove: () => void;
  analysis: AnalysisResource;
  nodes: WorkflowNodeView[];
  statement: string;
  onStatement: (value: string) => void;
}) {
  const plan = analysis.result.plan;
  const effect = plan.sideEffects[0];
  const invariant = plan.invariants[0];
  const provenance = analysis.result.provenance;
  return (
    <section className="contract-view" aria-labelledby="contract-heading">
      <header className="section-heading">
        <div>
          <p className="eyeline">Human approval boundary</p>
          <h1 id="contract-heading">Approve the contract before RetryProof executes it.</h1>
        </div>
        <span className="model-provenance"><Sparkles size={15} aria-hidden="true" /> {provenance.mode === "live" ? `${provenance.model} live analysis` : `Cached ${provenance.model} analysis`}</span>
      </header>
      <div className="graph-panel">
        <div className="panel-title"><span>Workflow graph</span><span className="mono">{nodes.length} declared nodes</span></div>
        <WorkflowGraph nodes={nodes} selectedNodeId={effect?.nodeId} />
      </div>
      <div className="contract-grid">
        <article className="invariant-editor">
          <p className="eyeline">Proposed invariant · editable</p>
          <label htmlFor="invariant">Business contract</label>
          <textarea id="invariant" rows={2} value={statement} onChange={(event) => onStatement(event.target.value)} disabled={approved} />
          <div className="oracle-preview mono">
            <span>oracle</span><strong>{invariant?.oracle.type ?? "at_most_once_effect"}</strong><span>key</span><strong>{invariant?.oracle.keyPath ?? "$.key"}</strong><span>maximum</span><strong>{invariant?.oracle.maximum ?? 1}</strong>
          </div>
          <label className="approval-check">
            <input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} disabled={approved} />
            <span>I confirm event.id is a durable business key and approve this invariant.</span>
          </label>
          <button className="button button--success" disabled={!checked || busy || approved} onClick={onApprove}>
            <Check size={17} aria-hidden="true" /> {approved ? "Invariant approved" : "Approve invariant"}
          </button>
        </article>
        <aside className="risk-inspector">
          <p className="eyeline">Selected operation</p>
          <h2>{effect?.nodeId ?? "Selected effect"} · <span className="mono">{effect?.operation ?? "External write"}</span></h2>
          <dl>
            <div><dt>Classification</dt><dd>{effect?.kind.replaceAll("_", " ") ?? "Unknown"}</dd></div>
            <div><dt>Reversibility</dt><dd>{effect?.reversibility ?? "Unknown"}</dd></div>
            <div><dt>Candidate key</dt><dd className="mono">{effect?.keyCandidates[0]?.jsonPath ?? "Unconfirmed"}</dd></div>
            <div><dt>Confidence</dt><dd>{effect?.confidence.toFixed(2) ?? "—"} · {(effect?.confidence ?? 0) >= 0.8 ? "high" : "review"}</dd></div>
          </dl>
          <p className="eyeline evidence-heading">Grounding evidence</p>
          <ul className="evidence-list">
            {(effect?.evidence ?? []).map((evidence) => (
              <li key={`${evidence.nodeId}-${evidence.jsonPath}`}><Eye size={14} aria-hidden="true" /><span className={`evidence-label evidence-label--${evidence.label}`}>{evidence.label}</span><code>{evidence.jsonPath}</code></li>
            ))}
            {(effect?.keyCandidates ?? []).map((candidate) => (
              <li key={candidate.jsonPath}><Eye size={14} aria-hidden="true" /><span className="evidence-label evidence-label--inferred">candidate</span><code>{candidate.jsonPath}</code></li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
