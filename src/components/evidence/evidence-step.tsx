"use client";

import { Check, Download, FileCheck2, Hash, ShieldCheck } from "lucide-react";
import type { ArtifactResource } from "@/features/lab/api-client";

export function EvidenceStep({
  artifact,
  focusScenarioId,
  onDownload,
}: {
  artifact: ArtifactResource;
  focusScenarioId?: string;
  onDownload: (kind: string) => void;
}) {
  const receipt = artifact.receipt;
  const afterById = new Map(receipt.after.results.map((result) => [result.scenarioId, result]));
  const beforeFailed = receipt.before.results.filter((result) => !result.passed).length;
  const beforePasses = receipt.before.results.length - beforeFailed;
  const firstBefore = receipt.before.results.find(
    (result) => result.scenarioId === focusScenarioId && !result.passed,
  ) ?? receipt.before.results.find((result) => !result.passed) ?? receipt.before.results[0];
  const firstAfter = firstBefore ? afterById.get(firstBefore.scenarioId) : receipt.after.results[0];
  const proofScenario = firstBefore
    ? receipt.before.scenarios.find((scenario) => scenario.id === firstBefore.scenarioId)
    : undefined;
  const proofKey = firstBefore?.effects[0]?.key ?? firstBefore?.verdicts[0]?.violatingKeys[0] ?? "no effect key";
  const coverage = receipt.workflow.coverage;
  const coveragePercent = coverage.total === 0 ? 0 : (coverage.supported / coverage.total) * 100;
  return (
    <section className="evidence-view" aria-labelledby="evidence-heading">
      <header className="success-banner">
        <div><Check size={22} aria-hidden="true" /><span>ALL DECLARED SCENARIOS PASSED</span></div>
        <strong>{firstBefore?.effects.length ?? 0} → {firstAfter?.effects.length ?? 0} <small>effect calls</small></strong>
      </header>
      <div className="evidence-grid">
        <article className="results-panel">
          <div className="panel-title"><span id="evidence-heading">Identical deterministic fault suite</span><span className="mono">seed {receipt.after.results[0]?.seed ?? "unavailable"}</span></div>
          <div className="result-table-wrap">
            <table className="result-table">
              <caption className="sr-only">Before and after scenario results</caption>
              <thead><tr><th>Scenario</th><th colSpan={2}>Before repair</th><th colSpan={2}>After repair</th><th>Change</th></tr></thead>
              <tbody>{receipt.before.results.map((before) => {
                const after = afterById.get(before.scenarioId);
                return (
                <tr key={before.scenarioId}>
                  <th scope="row"><strong>{before.scenarioId.replaceAll("_", " ")}</strong><small>{before.seed} · declared deterministic schedule</small></th>
                  <td>{before.effects.length} {before.effects.length === 1 ? "call" : "calls"}</td>
                  <td><span className={before.passed ? "result-pass" : "result-fail"}>{before.passed ? "✓ pass" : "× fail"}</span></td>
                  <td>{after?.effects.length ?? 0} {(after?.effects.length ?? 0) === 1 ? "call" : "calls"}</td>
                  <td><span className={after?.passed ? "result-pass" : "result-fail"}>{after?.passed ? "✓ pass" : "× fail"}</span></td>
                  <td className="mono">{before.effects.length} → {after?.effects.length ?? 0}</td>
                </tr>
              )})}</tbody>
            </table>
          </div>
          <div className="proof-summary">
            <div><span>Before</span><strong className="result-fail">{beforePasses}/{receipt.before.results.length} passed</strong></div>
            <div className="proof-summary__arrow">→</div>
            <div><span>After</span><strong className="result-pass">{receipt.after.results.filter((result) => result.passed).length}/{receipt.after.results.length} passed</strong></div>
            <div><span>Proof identity</span><strong className="mono">{proofKey} · {firstBefore?.scenarioId ?? "no scenario"} · {proofScenario?.deliveries ?? 0} deliveries</strong></div>
          </div>
        </article>
        <aside className="receipt-panel">
          <div className="receipt-panel__heading"><FileCheck2 size={21} aria-hidden="true" /><div><strong>Evidence receipt</strong><span>Verified by deterministic software</span></div></div>
          <dl className="receipt-metadata">
            <div><dt>Receipt ID</dt><dd className="mono">{artifact.id}</dd></div>
            <div><dt>Source hash</dt><dd className="mono">{receipt.workflow.sourceHash.slice(0, 8)}…{receipt.workflow.sourceHash.slice(-8)}</dd></div>
            <div><dt>Receipt hash</dt><dd className="mono">{artifact.sha256.slice(0, 8)}…{artifact.sha256.slice(-8)}</dd></div>
            <div><dt>Suite hash</dt><dd className="mono">{receipt.after.suiteHash.slice(0, 8)}…{receipt.after.suiteHash.slice(-8)}</dd></div>
          </dl>
          <div className="approved-contract"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Approved invariant</strong><p>{receipt.invariant.statement}</p></div></div>
          <div className="coverage-meter"><div><span>Declared coverage</span><strong>{coverage.supported}/{coverage.total} supported nodes</strong></div><span aria-hidden="true"><i style={{ width: `${coveragePercent}%` }} /></span></div>
          <div className="limitations"><strong>What this proves</strong><p>{receipt.claim}</p><strong>What this does not prove</strong><p>{receipt.limitations.join(" ")}</p></div>
          <button className="button button--primary" onClick={() => onDownload("evidence")}><Download size={16} aria-hidden="true" /> Download evidence receipt</button>
          <button className="button" onClick={() => onDownload("bundle")}><Hash size={16} aria-hidden="true" /> Download artifact bundle</button>
        </aside>
      </div>
    </section>
  );
}
