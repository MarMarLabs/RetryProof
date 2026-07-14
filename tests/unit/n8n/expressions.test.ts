import { describe, expect, it } from "vitest";

import {
  findUnsupportedExpressions,
  parseNarrowExpression,
  resolveNarrowExpression,
} from "@/lib/n8n";

describe("narrow n8n expressions", () => {
  it("accepts literals and property-only $json paths", () => {
    expect(parseNarrowExpression("refund.requested")).toEqual({
      supported: true,
      expression: { kind: "literal", value: "refund.requested" },
    });
    expect(parseNarrowExpression("={{ $json.event['items'][0].id }}")).toEqual({
      supported: true,
      expression: {
        kind: "json_path",
        source: "$json",
        segments: ["event", "items", 0, "id"],
        jsonPath: '$json.event.items[0].id',
      },
    });
  });

  it("resolves own properties without evaluating source text", () => {
    const parsed = parseNarrowExpression("={{ $json.event.id }}");
    expect(parsed.supported).toBe(true);
    if (!parsed.supported) return;
    expect(resolveNarrowExpression(parsed.expression, { event: { id: "evt_17" } })).toEqual({
      found: true,
      value: "evt_17",
    });
    expect(resolveNarrowExpression(parsed.expression, { event: {} })).toEqual({ found: false });
  });

  it.each([
    ["prefix {{ $json.id }}", "UNSUPPORTED_TEMPLATE"],
    ["={{ $env.API_KEY }}", "UNSUPPORTED_ROOT"],
    ["={{ $json.items.map(x => x.id) }}", "INVALID_PATH"],
    ["={{ $json.__proto__.polluted }}", "FORBIDDEN_PROPERTY"],
    ["={{ $json[unknown] }}", "INVALID_PATH"],
    ["={{ $json.id + '-suffix' }}", "INVALID_PATH"],
  ])("rejects unsupported expression %s", (value, reason) => {
    expect(parseNarrowExpression(value)).toEqual({ supported: false, reason });
  });

  it("caps expression path depth", () => {
    const value = `={{ $json${".a".repeat(33)} }}`;
    expect(parseNarrowExpression(value)).toEqual({
      supported: false,
      reason: "PATH_TOO_DEEP",
    });
  });

  it("rejects indexes that could create dangerous sparse arrays", () => {
    expect(parseNarrowExpression("={{ $json.items[257] }}")).toEqual({
      supported: false,
      reason: "INVALID_PATH",
    });
  });

  it("reports value-free JSONPaths for unsupported nested expressions", () => {
    const unsupported = findUnsupportedExpressions({
      headers: [{ value: "prefix {{ $json.id }}" }],
      body: "={{ $json.event }}",
    });
    expect(unsupported).toEqual([
      {
        jsonPath: "$.headers[0].value",
        reason: "UNSUPPORTED_TEMPLATE",
      },
    ]);
  });
});
