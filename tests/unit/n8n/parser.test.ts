import { describe, expect, it } from "vitest";

import {
  MAX_N8N_JSON_VALUES,
  MAX_N8N_UPLOAD_BYTES,
  N8nIngestionError,
  parseN8nWorkflow,
} from "@/lib/n8n";

import { makeSupportedWorkflow, workflowJson } from "./fixtures";

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("Expected action to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(N8nIngestionError);
    expect((error as N8nIngestionError).code).toBe(code);
    return error as N8nIngestionError;
  }
}

describe("parseN8nWorkflow", () => {
  it("parses the strict supported export shape", () => {
    const workflow = parseN8nWorkflow(workflowJson());
    expect(workflow.name).toBe("RetryProof refund demo");
    expect(workflow.nodes).toHaveLength(6);
  });

  it("rejects an oversized upload before attempting JSON parsing", () => {
    const error = expectCode(
      () => parseN8nWorkflow("x".repeat(MAX_N8N_UPLOAD_BYTES + 1)),
      "UPLOAD_TOO_LARGE",
    );
    expect(error.details).toEqual({ limit: MAX_N8N_UPLOAD_BYTES });
  });

  it("rejects invalid UTF-8", () => {
    expectCode(
      () => parseN8nWorkflow(Uint8Array.from([0xc3, 0x28])),
      "INVALID_UTF8",
    );
  });

  it("rejects excessive nesting without recursively traversing it", () => {
    const nested = `${'{"a":'.repeat(70)}null${"}".repeat(70)}`;
    const error = expectCode(
      () => parseN8nWorkflow(nested, { maxDepth: 32 }),
      "MAX_DEPTH_EXCEEDED",
    );
    expect(error.details.jsonPaths?.[0]).toMatch(/^\$\.a/);
  });

  it("rejects excessively wide JSON before traversal amplifies memory", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[0].parameters.wide = Array.from(
      { length: MAX_N8N_JSON_VALUES + 1 },
      () => 0,
    );
    const error = expectCode(
      () => parseN8nWorkflow(JSON.stringify(workflow)),
      "JSON_VALUE_LIMIT_EXCEEDED",
    );
    expect(error.details).toEqual({ limit: MAX_N8N_JSON_VALUES });
  });

  it("never echoes malformed source content in an error", () => {
    const inlineSecret = "secret-value-that-must-not-appear";
    const error = expectCode(
      () => parseN8nWorkflow(`{"password":"${inlineSecret}", BAD}`),
      "INVALID_JSON",
    );
    expect(error.message).not.toContain(inlineSecret);
    expect(JSON.stringify(error.details)).not.toContain(inlineSecret);
  });

  it("rejects forbidden object keys before schema validation", () => {
    const error = expectCode(
      () => parseN8nWorkflow('{"__proto__":{"polluted":true}}'),
      "DANGEROUS_PROPERTY",
    );
    expect(error.details.jsonPaths).toEqual(["$.__proto__"]);
  });

  it("enforces strict top-level and node allowlists", () => {
    const topLevel = { ...makeSupportedWorkflow(), unexpected: "no" };
    const topError = expectCode(
      () => parseN8nWorkflow(JSON.stringify(topLevel)),
      "INVALID_WORKFLOW",
    );
    expect(topError.details.jsonPaths).toContain("$");

    const workflow = makeSupportedWorkflow() as unknown as {
      nodes: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    workflow.nodes[0].unknownNodeField = true;
    const nodeError = expectCode(
      () => parseN8nWorkflow(JSON.stringify(workflow)),
      "INVALID_WORKFLOW",
    );
    expect(nodeError.details.jsonPaths).toContain("$.nodes[0]");
  });

  it("rejects duplicate node IDs and names", () => {
    const duplicateId = makeSupportedWorkflow();
    duplicateId.nodes[1].id = duplicateId.nodes[0].id;
    expectCode(
      () => parseN8nWorkflow(JSON.stringify(duplicateId)),
      "DUPLICATE_NODE_ID",
    );

    const duplicateName = makeSupportedWorkflow();
    duplicateName.nodes[1].name = duplicateName.nodes[0].name;
    expectCode(
      () => parseN8nWorkflow(JSON.stringify(duplicateName)),
      "DUPLICATE_NODE_NAME",
    );
  });

  it("rejects dangling source and target connections", () => {
    const danglingTarget = makeSupportedWorkflow();
    danglingTarget.connections["Create refund"].main[0][0].node = "Missing";
    expectCode(
      () => parseN8nWorkflow(JSON.stringify(danglingTarget)),
      "GRAPH_REFERENCE_INVALID",
    );

    const danglingSource = makeSupportedWorkflow();
    danglingSource.connections.Missing = { main: [] };
    expectCode(
      () => parseN8nWorkflow(JSON.stringify(danglingSource)),
      "GRAPH_REFERENCE_INVALID",
    );
  });

  it("rejects credential objects containing anything beyond references", () => {
    const workflow = makeSupportedWorkflow() as unknown as {
      nodes: Array<{ credentials?: Record<string, Record<string, unknown>> }>;
    };
    workflow.nodes[4].credentials = {
      httpHeaderAuth: {
        id: "reference",
        name: "Demo",
        apiKey: "must-not-be-accepted",
      },
    };
    expectCode(
      () => parseN8nWorkflow(JSON.stringify(workflow)),
      "INVALID_WORKFLOW",
    );
  });
});
