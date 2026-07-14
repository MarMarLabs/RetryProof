"use client";

import { CircleAlert, Play, TerminalSquare } from "lucide-react";
import { WorkflowGraph } from "@/components/graph/workflow-graph";
import type { ExecutionResource } from "@/features/lab/api-client";
import type { Scenario } from "@/domain";
import type { WorkflowNodeView } from "@/features/lab/types";

const SCENARIO_COPY: Record<Scenario["type"], { name: string; summary: string }> = {
  duplicate_delivery: {
    name: "Duplicate delivery",
    summary: "The same business event is delivered twice.",
  },
  effect_succeeded_then_timeout: {
    name: "Timeout after effect",
    summary: "Effect succeeds, response is lost, provider retries.",
  },
  rate_limited_then_retry: {
    name: "429 before effect",
    summary: "Provider rejects the call before any effect.",
  },
  partial_failure_then_retry: {
    name: "Partial failure after effect",
    summary: "A downstream failure replays the delivery.",
  },
};

export function FaultStep({
  complete,
  busy,
  selectedScenario,
  onScenario,
  onRun,
  onRepair,
  scenarios,
  execution,
  nodes,
  invariantStatement,
}: {
  complete: boolean;
  busy: boolean;
  selectedScenario: string;
  onScenario: (id: string) => void;
  onRun: () => void;
  onRepair: () => void;
  scenarios: Scenario[];
  execution: ExecutionResource | null;
  nodes: WorkflowNodeView[];
  invariantStatement: string;
}) {
  const selectedDefinition = scenarios.find((scenario) => scenario.id === selectedScenario)
    ?? scenarios[0];
  const selected = execution?.suite.results.find((result) => result.scenarioId === selectedScenario)
    ?? execution?.suite.results.find((result) => !result.passed)
    ?? execution?.suite.results[0];
  const maximumObserved = selected?.verdicts[0]?.maximumObserved ?? 0;
  return (
    <section className="fault-view" aria-labelledby="fault-heading">
      <header className="section-heading section-heading--compact">
        <div><p className="eyeline">Deterministic world · seed {execution?.suite.seed ?? "demo-v1"}</p><h1 id="fault-heading">Fault Lab</h1></div>
        <button className="button button--danger" onClick={onRun} disabled={busy}>
          <Play size={16} fill="currentColor" aria-hidden="true" /> {complete ? "Rerun identical fault" : "Run selected fault"}
        </button>
      </header>
      <div className="fault-grid">
        <div className="fault-grid__main">
          <div className="graph-panel graph-panel--compact">
            <div className="panel-title"><span>Workflow graph</span><span className="mono">target {selectedDefinition?.targetNodeId ?? "pending"}</span></div>
            <WorkflowGraph nodes={nodes} selectedNodeId={selectedDefinition?.targetNodeId} />
          </div>
          <div className={`trace-panel ${complete ? "is-failed" : ""}`}>
            <div className="panel-title"><span>Deterministic failure trace</span><span className="mono">{complete ? "counterexample #1" : "awaiting execution"}</span></div>
            {complete ? (
              <div className="trace-table-wrap">
                <table className="trace-table">
                  <caption className="sr-only">Ordered deterministic failure trace</caption>
                  <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Details</th><th>Node</th><th>Effect / response</th></tr></thead>
                  <tbody>{(selected?.trace.events ?? []).map((event) => (
                    <tr key={event.id} className={`tone-${event.type === "effect_recorded" || event.type === "fault_injected" ? "fail" : event.type === "invariant_evaluated" && event.details.passed === true ? "pass" : event.type === "delivery_failed" ? "warn" : "neutral"}`}>
                      <td><span className="trace-order">{event.sequence}</span></td><td className="mono">{new Date(event.at).toISOString().slice(11, 23)}</td><td><strong>{event.type.replaceAll("_", " ")}</strong></td><td className="mono">{Object.entries(event.details).slice(0, 2).map(([key, value]) => `${key}=${String(value)}`).join(" · ") || "—"}</td><td>{event.nodeId ?? "—"}</td><td>{event.delivery ? `delivery ${event.delivery}` : "system"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="trace-empty"><TerminalSquare size={28} aria-hidden="true" /><p>Run the selected fault to create a live trace. Mock adapters cannot open network sockets.</p></div>
            )}
            {complete ? (
              <div className="failure-verdict" role="status">
                <CircleAlert size={38} aria-hidden="true" />
                <div><strong>{selected?.passed ? "INVARIANT PASSED" : "INVARIANT FAILED"}</strong><span>{invariantStatement}</span></div>
                <div className="ledger-result"><span>Side-effect ledger result</span><strong>expected ≤ 1; observed {maximumObserved}</strong><small className="mono">trace {selected?.traceHash.slice(0, 12) ?? "pending"}…</small></div>
                <button className="button button--danger" onClick={onRepair}>Request Codex repair</button>
              </div>
            ) : null}
          </div>
        </div>
        <aside className="scenario-panel">
          <p className="eyeline">Fault scenarios</p>
          {scenarios.slice(0, 4).map((scenario) => {
            const copy = SCENARIO_COPY[scenario.type];
            return (
            <label className={`scenario-option ${selectedScenario === scenario.id ? "is-selected" : ""}`} key={scenario.id}>
              <input type="radio" name="scenario" value={scenario.id} checked={selectedScenario === scenario.id} onChange={() => onScenario(scenario.id)} />
              <span><strong>{copy.name}</strong><small>{copy.summary}</small></span>
            </label>
          )})}
          <div className="fault-model-note">
            <strong>Injection phase</strong>
            <code>{selectedDefinition?.faultPhase ?? "pending"}</code>
            <p>{selectedDefinition ? SCENARIO_COPY[selectedDefinition.type].summary : "Select a declared scenario to inspect its deterministic injection point."}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
