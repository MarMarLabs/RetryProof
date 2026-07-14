import { FORBIDDEN_PROPERTY_NAMES, appendJsonPath } from "./json-path";

export const MAX_EXPRESSION_SEGMENTS = 32;
export const MAX_EXPRESSION_ARRAY_INDEX = 256;

export type NarrowExpression =
  | Readonly<{ kind: "literal"; value: string | number | boolean | null }>
  | Readonly<{
      kind: "json_path";
      source: "$json";
      segments: readonly (string | number)[];
      jsonPath: string;
    }>;

export type ExpressionParseResult =
  | Readonly<{ supported: true; expression: NarrowExpression }>
  | Readonly<{
      supported: false;
      reason:
        | "UNSUPPORTED_TEMPLATE"
        | "UNSUPPORTED_ROOT"
        | "INVALID_PATH"
        | "PATH_TOO_DEEP"
        | "FORBIDDEN_PROPERTY";
    }>;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

function canonicalPath(segments: readonly (string | number)[]): string {
  return segments.reduce<string>(appendJsonPath, "$json");
}

function parsePath(body: string): ExpressionParseResult {
  if (!body.startsWith("$json")) {
    return { supported: false, reason: "UNSUPPORTED_ROOT" };
  }

  let cursor = "$json".length;
  const segments: Array<string | number> = [];

  while (cursor < body.length) {
    while (/\s/.test(body[cursor] ?? "")) cursor += 1;
    if (cursor >= body.length) break;

    let segment: string | number | undefined;
    if (body[cursor] === ".") {
      cursor += 1;
      const match = IDENTIFIER.exec(body.slice(cursor));
      if (!match) return { supported: false, reason: "INVALID_PATH" };
      segment = match[0];
      cursor += match[0].length;
    } else if (body[cursor] === "[") {
      cursor += 1;
      while (/\s/.test(body[cursor] ?? "")) cursor += 1;

      const quote = body[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        let value = "";
        let closed = false;
        while (cursor < body.length) {
          const character = body[cursor];
          if (character === "\\") {
            const escaped = body[cursor + 1];
            if (escaped !== quote && escaped !== "\\") {
              return { supported: false, reason: "INVALID_PATH" };
            }
            value += escaped;
            cursor += 2;
            continue;
          }
          if (character === quote) {
            cursor += 1;
            closed = true;
            break;
          }
          value += character;
          cursor += 1;
        }
        if (!closed || value.length === 0) {
          return { supported: false, reason: "INVALID_PATH" };
        }
        segment = value;
      } else {
        const indexMatch = /^\d+/.exec(body.slice(cursor));
        if (!indexMatch) return { supported: false, reason: "INVALID_PATH" };
        segment = Number(indexMatch[0]);
        if (
          !Number.isSafeInteger(segment) ||
          segment > MAX_EXPRESSION_ARRAY_INDEX
        ) {
          return { supported: false, reason: "INVALID_PATH" };
        }
        cursor += indexMatch[0].length;
      }

      while (/\s/.test(body[cursor] ?? "")) cursor += 1;
      if (body[cursor] !== "]") {
        return { supported: false, reason: "INVALID_PATH" };
      }
      cursor += 1;
    } else {
      return { supported: false, reason: "INVALID_PATH" };
    }

    if (typeof segment === "string" && FORBIDDEN_PROPERTY_NAMES.has(segment)) {
      return { supported: false, reason: "FORBIDDEN_PROPERTY" };
    }

    segments.push(segment);
    if (segments.length > MAX_EXPRESSION_SEGMENTS) {
      return { supported: false, reason: "PATH_TOO_DEEP" };
    }
  }

  if (segments.length === 0) {
    return { supported: false, reason: "INVALID_PATH" };
  }

  return {
    supported: true,
    expression: {
      kind: "json_path",
      source: "$json",
      segments,
      jsonPath: canonicalPath(segments),
    },
  };
}

export function containsN8nTemplate(value: string): boolean {
  return value.includes("{{") || value.includes("}}");
}

/**
 * Accept literals or one complete n8n expression whose body is a property-only
 * path rooted at $json. No interpolation, calls, operators, globals, or eval.
 */
export function parseNarrowExpression(
  value: string | number | boolean | null,
): ExpressionParseResult {
  if (typeof value !== "string") {
    return { supported: true, expression: { kind: "literal", value } };
  }

  if (!containsN8nTemplate(value)) {
    return { supported: true, expression: { kind: "literal", value } };
  }

  const match = /^=\{\{([\s\S]*)\}\}$/.exec(value);
  if (!match) {
    return { supported: false, reason: "UNSUPPORTED_TEMPLATE" };
  }

  return parsePath(match[1].trim());
}

export type ResolvedExpression = Readonly<{
  found: boolean;
  value?: unknown;
}>;

export function resolveNarrowExpression(
  expression: NarrowExpression,
  input: unknown,
): ResolvedExpression {
  if (expression.kind === "literal") {
    return { found: true, value: expression.value };
  }

  let current: unknown = input;
  for (const segment of expression.segments) {
    if (current === null || typeof current !== "object") {
      return { found: false };
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return { found: true, value: current };
}

export type UnsupportedExpression = Readonly<{
  jsonPath: string;
  reason: Extract<ExpressionParseResult, { supported: false }>["reason"];
}>;

export function findUnsupportedExpressions(
  value: unknown,
  basePath = "$",
): readonly UnsupportedExpression[] {
  const unsupported: UnsupportedExpression[] = [];
  const pending: Array<{ value: unknown; path: string }> = [
    { value, path: basePath },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    if (typeof current.value === "string") {
      if (containsN8nTemplate(current.value)) {
        const result = parseNarrowExpression(current.value);
        if (!result.supported) {
          unsupported.push({ jsonPath: current.path, reason: result.reason });
        }
      }
      continue;
    }

    if (current.value === null || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: current.value[index],
          path: appendJsonPath(current.path, index),
        });
      }
      continue;
    }

    for (const [key, child] of Object.entries(current.value)) {
      pending.push({ value: child, path: appendJsonPath(current.path, key) });
    }
  }

  return unsupported.sort((left, right) =>
    left.jsonPath.localeCompare(right.jsonPath),
  );
}
