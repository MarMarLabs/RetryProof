import assert from "node:assert/strict";

import fixtureJson from "../fixtures/simulator/refund-fixture.json";
import invariantJson from "../fixtures/simulator/refund-invariant.json";
import scenariosJson from "../fixtures/simulator/refund-scenarios.json";
import {
  invariantSchema,
  scenarioSchema,
} from "../src/domain/index";
import { createCachedRepair, createRegressionFixture } from "../src/lib/codex/cached-repair";
import { validateRepairProposal } from "../src/lib/codex/patch-validator";
import { DEMO_N8N_WORKFLOW } from "../src/lib/lab/demo";
import { toSimulatorWorkflow } from "../src/lib/lab/translator";
import { ingestN8nWorkflow } from "../src/lib/n8n/index";
import {
  runScenario,
  simulationFixtureSchema,
} from "../src/lib/simulator/index";

const RUNS = 10;
const fixture = simulationFixtureSchema.parse(fixtureJson);
const invariant = invariantSchema.parse(invariantJson);
const scenarios = scenariosJson.map((scenario) => scenarioSchema.parse(scenario));
const timeoutScenario = scenarios
  .find((scenario) => scenario.id === "timeout_after_refund");

assert(timeoutScenario, "The timeout-after-refund demo scenario is missing");
const imported = ingestN8nWorkflow(JSON.stringify(DEMO_N8N_WORKFLOW));
const unsafeWorkflow = toSimulatorWorkflow(imported.sanitizedWorkflow, "wf_rehearsal");
const regressionFixture = createRegressionFixture({
  fixture,
  scenarios,
  invariant,
  failingScenarioIds: [timeoutScenario.id],
  seed: "demo-v1",
});
const proposal = createCachedRepair({
  workflow: imported.sanitizedWorkflow,
  sourceHash: imported.sourceHash,
  invariantId: invariant.id,
  regressionFixture,
});
const validated = validateRepairProposal({
  proposal,
  sourceWorkflow: imported.sanitizedWorkflow,
  sourceHash: imported.sourceHash,
  approvedInvariantId: invariant.id,
  effectNodeIds: invariant.sourceNodeIds,
  expectedRegressionFixture: regressionFixture,
});
const repairedImport = ingestN8nWorkflow(JSON.stringify(validated.patchedWorkflow));
const repairedWorkflow = toSimulatorWorkflow(repairedImport.sanitizedWorkflow, "wf_rehearsal");

const run = (workflow: typeof unsafeWorkflow) =>
  runScenario({
    workflow,
    fixture,
    invariants: [invariant],
    scenario: timeoutScenario,
    seed: "demo-v1",
  });

const redRuns = Array.from({ length: RUNS }, () => run(unsafeWorkflow));
const greenRuns = Array.from({ length: RUNS }, () => run(repairedWorkflow));
const red = redRuns[0]!;
const green = greenRuns[0]!;

assert.equal(red.effects.length, 2, "Unsafe demo must show two refund effects");
assert.equal(red.passed, false, "Unsafe demo must fail the approved invariant");
assert.equal(green.effects.length, 1, "Repaired demo must show one refund effect");
assert.equal(green.passed, true, "Repaired demo must pass the approved invariant");
assert(redRuns.every((result) => JSON.stringify(result) === JSON.stringify(red)));
assert(greenRuns.every((result) => JSON.stringify(result) === JSON.stringify(green)));

console.log(
  JSON.stringify(
    {
      status: "pass",
      rehearsals: RUNS,
      scenario: timeoutScenario.id,
      seed: "demo-v1",
      before: { deliveries: timeoutScenario.deliveries, effects: 2, passed: false },
      after: { deliveries: timeoutScenario.deliveries, effects: 1, passed: true },
      repeatable: true,
      redTraceHash: red.traceHash,
      greenTraceHash: green.traceHash,
    },
    null,
    2,
  ),
);
