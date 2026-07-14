import { ArrowRight, DatabaseZap } from "lucide-react";
import type { WorkflowNodeView } from "@/features/lab/types";

export function WorkflowGraph({
  nodes,
  selectedNodeId,
  repaired = false,
}: {
  nodes: WorkflowNodeView[];
  selectedNodeId?: string;
  repaired?: boolean;
}) {
  const graphNodes = nodes;
  return (
    <div
      className="workflow-graph"
      role="img"
      aria-label={`${graphNodes.length}-node workflow ${repaired ? "after validated repair" : "before repair"}`}
    >
      {graphNodes.map((node, index) => (
        <div className="workflow-graph__segment" key={node.id}>
          <div
            className={`workflow-node workflow-node--${node.kind} ${node.id === selectedNodeId ? "is-selected" : ""}`}
            data-node-id={node.id}
          >
            {node.kind === "reservation" ? <DatabaseZap size={18} aria-hidden="true" /> : <span className="workflow-node__index">{index + 1}</span>}
            <strong>{node.label}</strong>
            <small>{node.detail}</small>
          </div>
          {index < graphNodes.length - 1 ? <ArrowRight className="workflow-arrow" size={18} aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}
