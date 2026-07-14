"use client";

import { FileJson2, LockKeyhole, Play, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { ModelMode, WorkflowResource } from "@/features/lab/api-client";

export function ImportStep({
  imported,
  busy,
  onDemo,
  onUpload,
  onContinue,
  workflow,
  fixture,
  mode,
  onMode,
  sessionReady,
}: {
  imported: boolean;
  busy: boolean;
  onDemo: () => void;
  onUpload: (workflow: File, fixture?: File) => void;
  onContinue: () => void;
  workflow: WorkflowResource | null;
  fixture: unknown;
  mode: ModelMode;
  onMode: (mode: ModelMode) => void;
  sessionReady: boolean;
}) {
  const coverage = workflow?.compatibility.coverage;
  return (
    <section className="import-view" aria-labelledby="import-heading">
      <div className="import-view__main">
        <div className="import-heading">
          <h1 id="import-heading">Break your automation before retries do.</h1>
          <p>Import a sanitized n8n workflow, approve its business invariant, and flight-test it against deterministic retries.</p>
        </div>
        <div className="import-actions">
          <button type="button" className="button button--primary" onClick={onDemo} disabled={busy || !sessionReady}>
            <Play size={17} fill="currentColor" aria-hidden="true" /> Try refund demo
          </button>
          <label className={`button ${busy || !sessionReady ? "is-disabled" : ""}`} htmlFor="workflow-file"><Upload size={17} aria-hidden="true" /> Upload workflow</label>
          <input
            className="sr-only"
            id="workflow-file"
            type="file"
            accept="application/json,.json"
            disabled={busy || !sessionReady}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onUpload(file);
            }}
          />
        </div>
        <div className={`drop-zone ${imported ? "is-complete" : ""}`}>
          {imported ? <ShieldCheck size={32} aria-hidden="true" /> : <FileJson2 size={32} aria-hidden="true" />}
          <div>
            <strong>{imported ? workflow?.name ?? "Sanitized workflow" : "Drop an n8n workflow JSON here"}</strong>
            <p>{imported ? `Sanitized snapshot · source hash ${workflow?.sourceHash.slice(0, 8) ?? "pending"}…` : "Pinned declarative export · 1 MB maximum"}</p>
          </div>
          {imported && coverage ? <span className="coverage-value">{coverage.supported}/{coverage.total} supported</span> : null}
        </div>
        <div className="fixture-editor">
          <div className="fixture-editor__header">
            <span>Synthetic fixture JSON</span>
            <span className="mono">read-only demo</span>
          </div>
          <pre>{JSON.stringify(fixture ?? { event: { id: "evt_example_1" } }, null, 2)}</pre>
        </div>
        <fieldset className="mode-control">
          <legend>Agent path</legend>
          <button type="button" className={mode === "live" ? "is-selected" : ""} aria-pressed={mode === "live"} onClick={() => onMode("live")} disabled={busy}>
            Live GPT-5.6 + Codex
            <small>Uses the configured OpenAI project</small>
          </button>
          <button type="button" className={mode === "cached" ? "is-selected" : ""} aria-pressed={mode === "cached"} onClick={() => onMode("cached")} disabled={busy}>
            Deterministic judge path
            <small>Cached agents; live simulator and validators</small>
          </button>
        </fieldset>
        <div className="safety-callout">
          <LockKeyhole size={22} aria-hidden="true" />
          <div>
            <strong>No real external action is performed.</strong>
            <p>Raw uploads are parsed in memory. Inline secrets are rejected before persistence or model analysis.</p>
          </div>
        </div>
        <div className="view-actions">
          <span className="view-actions__hint" aria-live="polite">{busy ? "Sanitizing and checking compatibility…" : !sessionReady ? "Establishing an anonymous lab session…" : imported ? "Ready for risk analysis." : "Choose the seeded demo or upload a supported workflow."}</span>
          <button type="button" className="button button--primary" disabled={!imported || busy} onClick={onContinue}>Analyze risk contract</button>
        </div>
      </div>
      <aside className="flow-rail" aria-label="RetryProof flow">
        <h2>The RetryProof flow</h2>
        {[
          ["1", "Import", "Sanitize the workflow and verify declared-node coverage."],
          ["2", "Approve", "Choose the business invariant that must survive retries."],
          ["3", "Break", "Inject deterministic faults and capture a counterexample."],
          ["4", "Verify", "Review a bounded repair and rerun the identical suite."],
        ].map(([number, title, text]) => (
          <div className="flow-rail__step" key={number}>
            <span>{number}</span><div><strong>{title}</strong><p>{text}</p></div>
          </div>
        ))}
        <div className="retention-note"><Trash2 size={18} aria-hidden="true" /><span>Anonymous lab data expires after 24 hours.</span></div>
      </aside>
    </section>
  );
}
