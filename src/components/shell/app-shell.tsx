"use client";

import { Beaker, Braces, FileCheck2, FlaskConical, Import, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import type { LabStage } from "@/features/lab/types";

const steps: Array<{ id: LabStage; label: string; icon: typeof Import }> = [
  { id: "import", label: "Import", icon: Import },
  { id: "contract", label: "Contract", icon: ShieldCheck },
  { id: "fault", label: "Fault Lab", icon: FlaskConical },
  { id: "repair", label: "Repair", icon: Wrench },
  { id: "evidence", label: "Evidence", icon: FileCheck2 },
];

export function AppShell({
  stage,
  unlocked,
  onNavigate,
  onReset,
  children,
}: {
  stage: LabStage;
  unlocked: Set<LabStage>;
  onNavigate: (stage: LabStage) => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">RP</div>
          <span>RetryProof</span>
        </div>
        <div className="topbar__status"><Beaker size={15} aria-hidden="true" /> Mock-only lab</div>
        <div className="topbar__meta"><Braces size={15} aria-hidden="true" /> n8n declarative slice</div>
      </header>
      <aside className="sidebar" aria-label="RetryProof workflow">
        <nav>
          {steps.map(({ id, label, icon: Icon }, index) => {
            const enabled = unlocked.has(id);
            return (
              <button
                key={id}
                type="button"
                className={`nav-step ${stage === id ? "is-active" : ""}`}
                disabled={!enabled}
                aria-current={stage === id ? "step" : undefined}
                onClick={() => onNavigate(id)}
              >
                <span className="nav-step__rail">{index + 1}</span>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar__bottom">
          <p>No production credentials.</p>
          <button type="button" className="button button--ghost button--small" onClick={onReset}>
            <RotateCcw size={14} aria-hidden="true" /> Reset lab
          </button>
        </div>
      </aside>
      <main className="workspace" id="main-content">{children}</main>
      <footer className="disclosure-bar">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Green means the approved invariant passed the declared scenarios. This is not a proof of exactly-once execution or production safety.</span>
      </footer>
    </div>
  );
}
