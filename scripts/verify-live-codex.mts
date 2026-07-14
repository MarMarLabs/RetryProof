import { CodexSdkRepairAgent } from "../src/lib/codex/repair-agent.ts";
import { createRegressionFixture } from "../src/lib/codex/cached-repair.ts";
import { validateRepairProposal } from "../src/lib/codex/patch-validator.ts";
import { invariantSchema, scenarioSchema } from "../src/domain/index.ts";
import { DEMO_FIXTURE, DEMO_N8N_WORKFLOW } from "../src/lib/lab/demo.ts";
import { toSimulatorWorkflow } from "../src/lib/lab/translator.ts";
import { ingestN8nWorkflow } from "../src/lib/n8n/index.ts";
import { createCachedDemoPlan } from "../src/lib/openai/cached-plan.ts";
import { runSuite } from "../src/lib/simulator/index.ts";

import invariantJson from "../fixtures/simulator/refund-invariant.json" with { type: "json" };
import scenariosJson from "../fixtures/simulator/refund-scenarios.json" with { type: "json" };

const imported = ingestN8nWorkflow(JSON.stringify(DEMO_N8N_WORKFLOW));
const canonicalGraph = JSON.parse(JSON.stringify(imported.canonicalWorkflow)) as {
  nodes: Array<{ id: string; parameters?: unknown }>;
};
const plan = createCachedDemoPlan({
  workflowId: "live_repair_probe",
  canonicalGraph,
});
const invariant = plan.invariants[0];
if (!invariant) throw new Error("The live repair probe has no approved invariant.");
const approvedInvariant = invariantSchema.parse({ ...invariantJson, id: invariant.id });
const scenarios = scenariosJson.map((scenario) => scenarioSchema.parse(scenario));
const timeoutScenario = scenarios.find((scenario) => scenario.id === "timeout_after_refund");
if (!timeoutScenario) throw new Error("The live repair probe has no timeout scenario.");
const failingSuite = runSuite({
  workflow: toSimulatorWorkflow(imported.sanitizedWorkflow, "live_repair_probe"),
  fixture: DEMO_FIXTURE,
  invariants: [approvedInvariant],
  scenarios: [timeoutScenario],
  seed: "live-repair-probe-v1",
});
if (failingSuite.passed) throw new Error("The live repair probe must begin red.");
const regressionFixture = createRegressionFixture({
  fixture: DEMO_FIXTURE,
  scenarios: [timeoutScenario],
  invariant: approvedInvariant,
  failingScenarioIds: [timeoutScenario.id],
  seed: failingSuite.seed,
});

const proposal = await new CodexSdkRepairAgent().createRepair({
  sourceHash: imported.sourceHash,
  workflow: structuredClone(imported.sanitizedWorkflow),
  fixture: DEMO_FIXTURE,
  invariant: approvedInvariant,
  scenarios: [timeoutScenario],
  failingTrace: failingSuite,
  mode: "live",
});

const validated = validateRepairProposal({
  proposal,
  sourceWorkflow: structuredClone(imported.sanitizedWorkflow),
  sourceHash: imported.sourceHash,
  approvedInvariantId: invariant.id,
  effectNodeIds: invariant.sourceNodeIds,
  expectedRegressionFixture: regressionFixture,
});

process.stdout.write(
  `${JSON.stringify(
    {
      mode: proposal.provenance.mode,
      threadIdPresent: Boolean(proposal.provenance.threadId),
      patchOps: proposal.patch.length,
      strategy: proposal.manifest.strategy,
      changedNodes: proposal.manifest.changedNodeIds.length,
      validatedNodeCount: ingestN8nWorkflow(
        JSON.stringify(validated.patchedWorkflow),
      ).sanitizedWorkflow.nodes.length,
    },
    null,
    2,
  )}\n`,
);
