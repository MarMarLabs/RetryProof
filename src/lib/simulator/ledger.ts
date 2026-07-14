import type { JsonValue } from "@/domain";

import type { DeterministicWorld } from "./world";

export interface SideEffect {
  id: string;
  sequence: number;
  effectId: string;
  key: string;
  nodeId: string;
  delivery: number;
  at: string;
  body: Record<string, JsonValue>;
}

export class SideEffectLedger {
  private readonly entries: SideEffect[] = [];

  constructor(private readonly world: DeterministicWorld) {}

  record(input: Omit<SideEffect, "id" | "sequence" | "at">): SideEffect {
    const entry: SideEffect = {
      id: this.world.nextId("effect"),
      sequence: this.entries.length + 1,
      at: this.world.now(),
      ...structuredClone(input),
    };
    this.entries.push(entry);
    this.world.record("effect_recorded", {
      delivery: entry.delivery,
      nodeId: entry.nodeId,
      details: {
        effectId: entry.effectId,
        key: entry.key,
        effectSequence: entry.sequence,
      },
    });
    return entry;
  }

  snapshot(): SideEffect[] {
    return structuredClone(this.entries);
  }
}
