import assert from "node:assert/strict";

import goldenCasesJson from "../tests/evals/golden-cases.json";
import fixtureJson from "../fixtures/simulator/refund-fixture.json";
import invariantJson from "../fixtures/simulator/refund-invariant.json";
import repairedWorkflowJson from "../fixtures/simulator/refund-workflow-repaired.json";
import scenariosJson from "../fixtures/simulator/refund-scenarios.json";
import unsafeWorkflowJson from "../fixtures/simulator/refund-workflow.json";
import {
  invariantSchema,
  scenarioSchema,
  workflowSnapshotSchema,
} from "../src/domain/index";
import {
  runScenario,
  simulationFixtureSchema,
} from "../src/lib/simulator/index";

type GoldenCase = (typeof goldenCasesJson.cases)[number];

const unsafeWorkflow = workflowSnapshotSchema.parse(unsafeWorkflowJson);
const repairedWorkflow = workflowSnapshotSchema.parse(repairedWorkflowJson);
const fixture = simulationFixtureSchema.parse(fixtureJson);
const invariant = invariantSchema.parse(invariantJson);
const scenarios = scenariosJson.map((scenario) => scenarioSchema.parse(scenario));
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

function verifyCase(goldenCase: GoldenCase): void {
  const scenario = scenarioById.get(goldenCase.scenarioId);
  assert(scenario, `Missing scenario ${goldenCase.scenarioId}`);
  assert.equal(scenario.faultPhase, goldenCase.faultPhase);

  const input = { fixture, invariants: [invariant], scenario, seed: "golden-v1" };
  const unsafe = runScenario({ ...input, workflow: unsafeWorkflow });
  const repeatedUnsafe = runScenario({ ...input, workflow: unsafeWorkflow });
  const repaired = runScenario({ ...input, workflow: repairedWorkflow });
  const repeatedRepaired = runScenario({ ...input, workflow: repairedWorkflow });

  assert.equal(unsafe.effects.length, goldenCase.unsafeEffects);
  assert.equal(repaired.effects.length, goldenCase.repairedEffects);
  assert.equal(unsafe.passed, goldenCase.unsafePass);
  assert.equal(repaired.passed, goldenCase.repairedPass);
  assert.equal(JSON.stringify(unsafe), JSON.stringify(repeatedUnsafe));
  assert.equal(JSON.stringify(repaired), JSON.stringify(repeatedRepaired));
  assert.equal(unsafe.traceHash, repeatedUnsafe.traceHash);
  assert.equal(repaired.traceHash, repeatedRepaired.traceHash);
  assert.equal(
    unsafe.trace.events.filter((event) => event.type === "fault_injected").length,
    1,
  );
  assert(
    unsafe.limitations.some((limitation) => limitation.includes("exactly-once")),
    "Evidence must preserve the exactly-once limitation",
  );
}

for (const goldenCase of goldenCasesJson.cases) verifyCase(goldenCase);

console.log(
  JSON.stringify(
    {
      status: "pass",
      suite: "RetryProof deterministic golden evaluation",
      cases: goldenCasesJson.cases.length,
      seed: "golden-v1",
      boundary:
        "Evidence applies only to declared deterministic scenarios; it is not exactly-once or production-safety proof.",
    },
    null,
    2,
  ),
);
