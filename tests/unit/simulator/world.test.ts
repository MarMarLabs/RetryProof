import { describe, expect, it } from "vitest";

import { LogicalReservationStore } from "@/lib/simulator/adapters/reservation-store";
import { DeterministicWorld } from "@/lib/simulator/world";

describe("deterministic world", () => {
  it("produces the same clock, IDs, and serialized trace for the same seed", () => {
    const first = new DeterministicWorld("repeatable-seed", "scenario");
    const second = new DeterministicWorld("repeatable-seed", "scenario");

    for (const world of [first, second]) {
      world.record("delivery_started", { delivery: 1 });
      world.record("node_started", { delivery: 1, nodeId: "node_1" });
    }

    expect(first.snapshotTrace()).toEqual(second.snapshotTrace());
    expect(first.traceHash()).toBe(second.traceHash());
  });

  it("provides atomic logical reservations without SQL", () => {
    const store = new LogicalReservationStore();
    expect(store.reserve("refunds", "evt_1")).toBe(true);
    expect(store.reserve("refunds", "evt_1")).toBe(false);
    expect(store.reserve("refunds", "evt_2")).toBe(true);
    expect(store.snapshot()).toEqual([
      { namespace: "refunds", key: "evt_1" },
      { namespace: "refunds", key: "evt_2" },
    ]);
  });
});
