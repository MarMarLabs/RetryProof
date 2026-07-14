import { beforeEach, describe, expect, it } from "vitest";

import { POST as analyze } from "@/app/api/v1/workflows/[id]/analyses/route";
import { PATCH as approve } from "@/app/api/v1/analyses/[id]/plan/route";
import { POST as defineScenarios } from "@/app/api/v1/analyses/[id]/scenarios/route";
import { POST as execute } from "@/app/api/v1/analyses/[id]/executions/route";
import { POST as repair } from "@/app/api/v1/analyses/[id]/repairs/route";
import { GET as getArtifact } from "@/app/api/v1/artifacts/[id]/route";
import { GET as downloadArtifact } from "@/app/api/v1/artifacts/[id]/download/route";
import { POST as recheck } from "@/app/api/v1/repairs/[id]/recheck/route";
import { DELETE as deleteSession, GET as establishSession } from "@/app/api/v1/session/route";
import { POST as upload } from "@/app/api/v1/workflows/route";
import { MemoryLabRepository, setLabRepositoryForTests } from "@/lib/lab/repository";
import { DEMO_N8N_WORKFLOW } from "@/lib/lab/demo";
import { toSimulatorWorkflow } from "@/lib/lab/translator";
import type { RepairRecord, WorkflowRecord } from "@/lib/lab/types";
import { ingestN8nWorkflow } from "@/lib/n8n";
import { validateRepairProposal } from "@/lib/codex/patch-validator";
import { InMemoryStore, setStoreForTests } from "@/lib/platform";

let repository: MemoryLabRepository;

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected session cookie");
  return setCookie.split(";", 1)[0]!;
}

async function sessionContext(): Promise<{ cookie: string; csrf: string }> {
  const response = await establishSession(request("http://local/api/v1/session"));
  expect(response.status).toBe(200);
  const cookie = cookieFrom(response);
  const body = await response.json();
  return { cookie, csrf: body.session.csrfToken as string };
}

function request(
  url: string,
  input: { cookie?: string; csrf?: string; method?: string; body?: unknown; headers?: HeadersInit } = {},
): Request {
  const headers = new Headers(input.headers);
  if (input.cookie) headers.set("cookie", input.cookie);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  if (input.body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    method: input.method ?? (input.body === undefined ? "GET" : "POST"),
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
}

beforeEach(() => {
  process.env.SESSION_SIGNING_SECRET = "test-session-secret-at-least-thirty-two-characters";
  process.env.DEMO_MODEL_MODE = "cached";
  process.env.CODEX_REPAIR_MODE = "cached";
  delete process.env.OPENAI_ANALYSIS_MODEL;
  setStoreForTests(new InMemoryStore());
  repository = new MemoryLabRepository();
  setLabRepositoryForTests(repository);
});

describe("RetryProof API", () => {
  it("establishes a signed session and refuses state changes without CSRF", async () => {
    const sessionResponse = await establishSession(request("http://local/api/v1/session"));
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(sessionResponse.headers.get("vary")).toBe("Cookie");
    const cookie = cookieFrom(sessionResponse);

    const denied = await upload(
      request("http://local/api/v1/workflows", { cookie, body: { demo: true } }),
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("CSRF_INVALID");
  });

  it("requires a pre-established session before reading a workflow upload", async () => {
    const denied = await upload(
      request("http://local/api/v1/workflows", { body: { demo: true } }),
    );
    expect(denied.status).toBe(401);
    expect((await denied.json()).error.code).toBe("SESSION_REQUIRED");
  });

  it("rejects inline secrets and oversized multipart uploads without reflecting source data", async () => {
    const firstSession = await sessionContext();
    const unsafe = structuredClone(DEMO_N8N_WORKFLOW);
    const secret = "do-not-reflect-this-secret";
    unsafe.nodes[3]!.parameters.apiKey = secret;
    const unsafeForm = new FormData();
    unsafeForm.set(
      "workflow",
      new File([JSON.stringify(unsafe)], "unsafe.json", { type: "application/json" }),
    );
    const rejected = await upload(
      new Request("http://local/api/v1/workflows", {
        method: "POST",
        body: unsafeForm,
        headers: {
          cookie: firstSession.cookie,
          "x-csrf-token": firstSession.csrf,
        },
      }),
    );
    const rejectedText = await rejected.text();
    expect(rejected.status).toBe(422);
    expect(rejectedText).toContain("INLINE_SECRET_DETECTED");
    expect(rejectedText).toContain("$.nodes[3].parameters.apiKey");
    expect(rejectedText).not.toContain(secret);

    setStoreForTests(new InMemoryStore());
    setLabRepositoryForTests(new MemoryLabRepository());
    const secondSession = await sessionContext();
    const oversizedForm = new FormData();
    oversizedForm.set(
      "workflow",
      new File([new Uint8Array(1024 * 1024 + 1)], "oversized.json"),
    );
    const oversized = await upload(
      new Request("http://local/api/v1/workflows", {
        method: "POST",
        body: oversizedForm,
        headers: {
          cookie: secondSession.cookie,
          "x-csrf-token": secondSession.csrf,
        },
      }),
    );
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe("UPLOAD_TOO_LARGE");
  });

  it("imports, approves, and deterministically proves the unsafe workflow red", async () => {
    const session = await sessionContext();
    const uploadResponse = await upload(
      request("http://local/api/v1/workflows", {
        cookie: session.cookie,
        csrf: session.csrf,
        body: { demo: true },
      }),
    );
    expect(uploadResponse.status).toBe(201);
    const cookie = session.cookie;
    const imported = await uploadResponse.json();
    const csrf = session.csrf;
    expect(imported.workflow.compatibility.canExecute).toBe(true);
    expect(JSON.stringify(imported)).not.toContain("sanitizedWorkflow");
    const storedWorkflow = await repository.get<WorkflowRecord>("workflow", imported.workflow.id);
    expect(storedWorkflow?.simulatorWorkflow).toEqual(
      toSimulatorWorkflow(storedWorkflow!.sanitizedWorkflow, imported.workflow.id),
    );

    const analysisResponse = await analyze(
      request("http://local/analysis", { cookie, csrf, body: { mode: "cached" } }),
      { params: Promise.resolve({ id: imported.workflow.id }) },
    );
    expect(analysisResponse.status).toBe(201);
    const analyzed = await analysisResponse.json();
    const planHash = analyzed.analysis.planHash as string;
    expect(analyzed.analysis.result.provenance.mode).toBe("cached");
    expect(analyzed.analysis.result.provenance.model).toBe("gpt-5.6-sol");

    const stale = await approve(
      request("http://local/plan", {
        method: "PATCH",
        cookie,
        csrf,
        body: { approvedPlan: { approved: true } },
        headers: { "if-match": `"${"0".repeat(64)}"` },
      }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("STALE_PLAN");

    const proposedInvariant = analyzed.analysis.result.plan.invariants[0];
    const unboundInvariant = {
      schemaVersion: "1",
      id: proposedInvariant.id,
      statement: proposedInvariant.statement,
      oracle: { ...proposedInvariant.oracle, effectId: "ghost" },
      sourceNodeIds: proposedInvariant.sourceNodeIds,
      approved: true,
    };
    const ungrounded = await approve(
      request("http://local/plan", {
        method: "PATCH",
        cookie,
        csrf,
        body: {
          approvedPlan: {
            approved: true,
            invariants: [unboundInvariant],
          },
        },
        headers: { "if-match": `"${planHash}"` },
      }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(ungrounded.status).toBe(422);
    expect((await ungrounded.json()).error.code).toBe("INVARIANT_NOT_GROUNDED");

    const approvalResponse = await approve(
      request("http://local/plan", {
        method: "PATCH",
        cookie,
        csrf,
        body: { approvedPlan: { approved: true } },
        headers: { "if-match": `"${planHash}"` },
      }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(approvalResponse.status).toBe(200);

    const scenariosResponse = await defineScenarios(
      request("http://local/scenarios", {
        cookie,
        csrf,
        body: { scenarioIds: ["timeout_after_refund", "duplicate_delivery"] },
      }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(scenariosResponse.status).toBe(201);

    const executionRequest = () =>
      request("http://local/executions", {
        cookie,
        csrf,
        body: { phase: "before", seed: "demo-v1" },
        headers: { "idempotency-key": "execution-demo-before-1" },
      });
    const first = await execute(executionRequest(), {
      params: Promise.resolve({ id: analyzed.analysis.id }),
    });
    expect(first.status).toBe(201);
    const red = await first.json();
    expect(red.execution.suite.passed).toBe(false);
    expect(red.execution.suite.results[0].verdicts[0].maximumObserved).toBe(2);

    const replay = await execute(executionRequest(), {
      params: Promise.resolve({ id: analyzed.analysis.id }),
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.json()).toEqual(red);

    const disallowedLiveRepair = await repair(
      request("http://local/repairs", { cookie, csrf, body: { mode: "live" } }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(disallowedLiveRepair.status).toBe(422);
    expect((await disallowedLiveRepair.json()).error.code).toBe("LIVE_CODEX_LOCAL_ONLY");

    const repairResponse = await repair(
      request("http://local/repairs", { cookie, csrf, body: { mode: "cached" } }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(repairResponse.status).toBe(201);
    const repaired = await repairResponse.json();
    expect(repaired.repair.proposal.provenance.mode).toBe("cached");
    const storedRepair = await repository.get<RepairRecord>("repair", repaired.repair.id);
    const validatedPatch = validateRepairProposal({
      proposal: storedRepair!.proposal,
      sourceWorkflow: storedWorkflow!.sanitizedWorkflow as unknown as Record<string, unknown>,
      sourceHash: storedWorkflow!.sourceHash,
      approvedInvariantId: proposedInvariant.id,
      effectNodeIds: proposedInvariant.sourceNodeIds,
      expectedRegressionFixture: storedRepair!.proposal.regressionFixture,
    });
    const patchedImport = ingestN8nWorkflow(JSON.stringify(validatedPatch.patchedWorkflow));
    expect(storedRepair?.repairedWorkflow).toEqual(
      toSimulatorWorkflow(patchedImport.sanitizedWorkflow, imported.workflow.id),
    );
    expect(storedRepair?.regressionValidation).toMatchObject({
      beforePassed: false,
      afterPassed: true,
      scenarioIds: expect.arrayContaining(["timeout_after_refund"]),
    });

    const secondRepairResponse = await repair(
      request("http://local/repairs", { cookie, csrf, body: { mode: "cached" } }),
      { params: Promise.resolve({ id: analyzed.analysis.id }) },
    );
    expect(secondRepairResponse.status).toBe(201);
    const secondRepair = await secondRepairResponse.json();
    expect(secondRepair.repair.id).not.toBe(repaired.repair.id);

    const recheckResponse = await recheck(
      request("http://local/recheck", { cookie, csrf, body: { seed: "demo-v1" } }),
      { params: Promise.resolve({ id: repaired.repair.id }) },
    );
    expect(recheckResponse.status).toBe(201);
    const green = await recheckResponse.json();
    expect(green.execution.repairId).toBe(repaired.repair.id);
    expect(green.artifact.repairId).toBe(repaired.repair.id);
    expect(green.artifact.receipt.repair.id).toBe(repaired.repair.id);
    expect(green.execution.suite.passed).toBe(true);
    expect(green.execution.suite.results.every((result: { passed: boolean }) => result.passed)).toBe(true);
    expect(green.artifact.receipt.limitations.join(" ")).toContain("does not claim exactly-once");

    const artifactResponse = await getArtifact(
      request("http://local/artifact", { cookie }),
      { params: Promise.resolve({ id: green.artifact.id }) },
    );
    expect(artifactResponse.status).toBe(200);
    expect(artifactResponse.headers.get("cache-control")).toBe("private, no-store");

    const downloadResponse = await downloadArtifact(
      request("http://local/artifact/download", { cookie }),
      { params: Promise.resolve({ id: green.artifact.id }) },
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toBe("application/zip");
    const bytes = new Uint8Array(await downloadResponse.arrayBuffer());
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");

    const deleted = await deleteSession(
      request("http://local/session", { method: "DELETE", cookie, csrf }),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");

    const gone = await getArtifact(
      request("http://local/artifact", { cookie }),
      { params: Promise.resolve({ id: green.artifact.id }) },
    );
    expect(gone.status).toBe(401);
  });
});
