import type { Invariant, InvariantVerdict } from "@/domain";

import type { SideEffect } from "../ledger";
import { readJsonPath } from "../expressions";
import { deterministicSerialize } from "../serialization";

function displayKey(value: unknown): string {
  return typeof value === "string" ? value : deterministicSerialize(value);
}

export function evaluateAtMostOnce(
  invariant: Invariant,
  effects: SideEffect[],
): InvariantVerdict {
  const counts = new Map<string, number>();
  for (const effect of effects) {
    if (effect.effectId !== invariant.oracle.effectId) continue;
    const keyValue = readJsonPath(effect, invariant.oracle.keyPath);
    if (keyValue === undefined) {
      throw new Error(`Invariant keyPath did not resolve: ${invariant.oracle.keyPath}`);
    }
    const key = displayKey(keyValue);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const maximumObserved = Math.max(0, ...counts.values());
  return {
    invariantId: invariant.id,
    passed: maximumObserved <= invariant.oracle.maximum,
    maximumObserved,
    violatingKeys: [...counts.entries()]
      .filter(([, count]) => count > invariant.oracle.maximum)
      .map(([key]) => key)
      .sort(),
  };
}
