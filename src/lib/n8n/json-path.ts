const SAFE_PROPERTY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function appendJsonPath(path: string, key: string | number): string {
  if (typeof key === "number") {
    return `${path}[${key}]`;
  }

  if (SAFE_PROPERTY.test(key)) {
    return `${path}.${key}`;
  }

  return `${path}[${JSON.stringify(key)}]`;
}

export function segmentsToJsonPath(
  segments: readonly (string | number)[],
): string {
  return segments.reduce<string>(appendJsonPath, "$");
}

export const FORBIDDEN_PROPERTY_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
