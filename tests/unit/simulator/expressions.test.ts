import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  evaluateExpression,
  readJsonPath,
  writeJsonPath,
} from "@/lib/simulator/expressions";

describe("narrow expression evaluator", () => {
  it("reads and writes only the declared JSONPath grammar", () => {
    const value = { event: { lines: [{ id: "line_1" }] } };
    expect(readJsonPath(value, "$.event.lines[0].id")).toBe("line_1");
    expect(
      evaluateExpression({ kind: "json_path", path: "$.event.lines[0].id" }, value),
    ).toBe("line_1");
    expect(writeJsonPath(value, "$.result.status", "ok")).toEqual({
      event: { lines: [{ id: "line_1" }] },
      result: { status: "ok" },
    });
  });

  it("does not mutate input and blocks prototype paths", () => {
    const input = { event: { id: "evt_1" } };
    const output = writeJsonPath(input, "$.copy.id", "evt_1");
    expect(output).not.toBe(input);
    expect(input).toEqual({ event: { id: "evt_1" } });
    expect(() => readJsonPath(input, "$.constructor.prototype")).toThrow();
    expect(() => writeJsonPath(input, "$.__proto__.polluted", true)).toThrow();
  });

  it("rejects array indexes large enough to create a sparse-array memory hazard", () => {
    const input = { values: [] };
    expect(() => writeJsonPath(input, "$.values[257]", true)).toThrow(
      "JSONPath array indexes must not exceed 256",
    );
  });

  it("evaluates supported conditions without coercion", () => {
    const context = { enabled: true, count: 1 };
    expect(
      evaluateCondition(
        {
          left: { kind: "json_path", path: "$.count" },
          operator: "equals",
          right: { kind: "literal", value: 1 },
        },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        {
          left: { kind: "json_path", path: "$.enabled" },
          operator: "truthy",
        },
        context,
      ),
    ).toBe(true);
  });
});
