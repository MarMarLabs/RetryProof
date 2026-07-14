import type { ExecutionTrace, JsonValue, TraceEvent } from "@/domain";

import { deterministicHash } from "./serialization";

const BASE_TIME_MS = Date.parse("2026-07-13T16:00:00.000Z");

export interface RecordTraceEvent {
  delivery?: number;
  nodeId?: string;
  details?: Record<string, JsonValue>;
}

export class DeterministicWorld {
  readonly seed: string;
  readonly scenarioId: string;
  private readonly events: TraceEvent[] = [];
  private tick = 0;
  private idSequence = 0;
  private readonly timeOffset: number;

  constructor(seed: string, scenarioId: string) {
    if (!seed || seed.length > 128) throw new Error("seed must contain 1-128 characters");
    this.seed = seed;
    this.scenarioId = scenarioId;
    this.timeOffset = Number.parseInt(deterministicHash({ seed }).slice(0, 8), 16) % 86_400_000;
  }

  now(): string {
    const value = new Date(BASE_TIME_MS + this.timeOffset + this.tick * 7).toISOString();
    this.tick += 1;
    return value;
  }

  nextId(prefix: string): string {
    this.idSequence += 1;
    return `${prefix}_${String(this.idSequence).padStart(6, "0")}`;
  }

  record(type: TraceEvent["type"], input: RecordTraceEvent = {}): TraceEvent {
    const event: TraceEvent = {
      id: this.nextId("trace"),
      sequence: this.events.length,
      at: this.now(),
      type,
      ...(input.delivery === undefined ? {} : { delivery: input.delivery }),
      ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
      details: structuredClone(input.details ?? {}),
    };
    this.events.push(event);
    return event;
  }

  snapshotTrace(): ExecutionTrace {
    return {
      schemaVersion: "1",
      scenarioId: this.scenarioId,
      seed: this.seed,
      events: structuredClone(this.events),
    };
  }

  traceHash(): string {
    return deterministicHash(this.snapshotTrace());
  }
}
