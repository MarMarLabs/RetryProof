import type { JsonValue } from "@/domain";
import { jsonPath, MAX_JSON_PATH_INDEX, type Expression } from "@/domain";
import type { z } from "zod";

import type { conditionSchema } from "@/domain/workflow";
import { deterministicSerialize } from "./serialization";

type Condition = z.infer<typeof conditionSchema>;

const forbiddenSegments = new Set(["__proto__", "prototype", "constructor"]);

function tokenize(path: string): Array<string | number> {
  jsonPath.parse(path);
  const tokens: Array<string | number> = [];
  const pattern = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  for (const match of path.matchAll(pattern)) {
    const property = match[1];
    if (property !== undefined) {
      if (forbiddenSegments.has(property)) throw new Error("Unsafe JSONPath segment");
      tokens.push(property);
    } else {
      const index = Number(match[2]);
      if (index > MAX_JSON_PATH_INDEX) {
        throw new Error("JSONPath array index exceeds the supported limit");
      }
      tokens.push(index);
    }
  }
  return tokens;
}

export function readJsonPath(root: unknown, path: string): JsonValue | undefined {
  let current: unknown = root;
  for (const token of tokenize(path)) {
    if (current === null || typeof current !== "object") return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[token];
    } else {
      if (Array.isArray(current) || !Object.hasOwn(current, token)) return undefined;
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current as JsonValue | undefined;
}

export function writeJsonPath(
  root: Record<string, JsonValue>,
  path: string,
  value: JsonValue,
): Record<string, JsonValue> {
  const tokens = tokenize(path);
  if (tokens.length === 0) {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      throw new Error("Root assignment must be an object");
    }
    return structuredClone(value) as Record<string, JsonValue>;
  }

  const output = structuredClone(root);
  let current: Record<string, JsonValue> | JsonValue[] = output;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const last = index === tokens.length - 1;
    if (last) {
      if (typeof token === "number") {
        if (!Array.isArray(current)) throw new Error("JSONPath array segment targets an object");
        current[token] = structuredClone(value);
      } else {
        if (Array.isArray(current)) throw new Error("JSONPath property segment targets an array");
        current[token] = structuredClone(value);
      }
      break;
    }

    const nextToken = tokens[index + 1]!;
    const created: Record<string, JsonValue> | JsonValue[] =
      typeof nextToken === "number" ? [] : {};
    if (typeof token === "number") {
      if (!Array.isArray(current)) throw new Error("JSONPath array segment targets an object");
      const existing = current[token];
      if (existing === undefined) current[token] = created;
      const selected: JsonValue | undefined = current[token];
      if (selected === null || typeof selected !== "object") {
        throw new Error("JSONPath cannot traverse a primitive");
      }
      current = selected;
    } else {
      if (Array.isArray(current)) throw new Error("JSONPath property segment targets an array");
      const existing = current[token];
      if (existing === undefined) current[token] = created;
      const selected: JsonValue | undefined = current[token];
      if (selected === null || typeof selected !== "object") {
        throw new Error("JSONPath cannot traverse a primitive");
      }
      current = selected;
    }
  }
  return output;
}

export function evaluateExpression(expression: Expression, context: unknown): JsonValue {
  if (expression.kind === "literal") return structuredClone(expression.value);
  const value = readJsonPath(context, expression.path);
  if (value === undefined) throw new Error(`JSONPath did not resolve: ${expression.path}`);
  return structuredClone(value);
}

export function evaluateCondition(condition: Condition, context: unknown): boolean {
  const left =
    condition.left.kind === "json_path"
      ? readJsonPath(context, condition.left.path)
      : condition.left.value;
  if (condition.operator === "exists") return left !== undefined;
  if (condition.operator === "truthy") return Boolean(left);
  if (!condition.right) throw new Error(`${condition.operator} requires a right expression`);
  const right = evaluateExpression(condition.right, context);
  const equal = deterministicSerialize(left) === deterministicSerialize(right);
  return condition.operator === "equals" ? equal : !equal;
}
