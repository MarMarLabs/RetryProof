import { describe, expect, it } from "vitest";

import { MockHttpAdapter } from "@/lib/simulator/adapters/mock-http";
import { SideEffectLedger } from "@/lib/simulator/ledger";
import { DeterministicWorld } from "@/lib/simulator/world";

describe("mock HTTP adapter", () => {
  it("records configured effects without networking", () => {
    const world = new DeterministicWorld("http", "scenario");
    const ledger = new SideEffectLedger(world);
    const adapter = new MockHttpAdapter(
      [
        {
          routeId: "refunds_create",
          method: "POST",
          path: "/refunds",
          status: 201,
          responseBody: { ok: true },
        },
      ],
      ledger,
      world,
    );

    const response = adapter.request({
      routeId: "refunds_create",
      method: "POST",
      path: "/refunds",
      body: { event_id: "evt_1" },
      effect: { effectId: "refunds", key: "evt_1", nodeId: "http", delivery: 1 },
    });

    expect(response).toEqual({ status: 201, body: { ok: true } });
    expect(ledger.snapshot()).toHaveLength(1);
  });

  it("fails closed for unknown or mismatched mock routes", () => {
    const world = new DeterministicWorld("http", "scenario");
    const adapter = new MockHttpAdapter([], new SideEffectLedger(world), world);
    expect(() =>
      adapter.request({
        routeId: "https://real.example",
        method: "POST",
        path: "/",
        body: {},
      }),
    ).toThrow(/Unknown mock route/);
  });
});
