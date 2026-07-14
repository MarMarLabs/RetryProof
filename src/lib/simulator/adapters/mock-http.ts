import type { JsonValue } from "@/domain";

import type { HttpMock } from "../contracts";
import type { SideEffectLedger } from "../ledger";
import type { DeterministicWorld } from "../world";

interface EffectRequest {
  effectId: string;
  key: string;
  nodeId: string;
  delivery: number;
}

export interface MockHttpRequest {
  routeId: string;
  method: HttpMock["method"];
  path: string;
  body: Record<string, JsonValue>;
  effect?: EffectRequest;
  afterEffect?: () => void;
}

export interface MockHttpResponse {
  status: number;
  body: Record<string, JsonValue>;
}

export class MockHttpAdapter {
  private readonly routes: Map<string, HttpMock>;

  constructor(
    mocks: HttpMock[],
    private readonly ledger: SideEffectLedger,
    private readonly world: DeterministicWorld,
  ) {
    this.routes = new Map(mocks.map((mock) => [mock.routeId, structuredClone(mock)]));
  }

  request(request: MockHttpRequest): MockHttpResponse {
    const route = this.routes.get(request.routeId);
    if (!route) throw new Error(`Unknown mock route: ${request.routeId}`);
    if (route.method !== request.method || route.path !== request.path) {
      throw new Error(`Mock route contract mismatch: ${request.routeId}`);
    }
    this.world.record("http_mock_called", {
      delivery: request.effect?.delivery,
      nodeId: request.effect?.nodeId,
      details: { routeId: request.routeId, method: request.method, path: request.path },
    });
    if (request.effect) {
      this.ledger.record({
        effectId: request.effect.effectId,
        key: request.effect.key,
        nodeId: request.effect.nodeId,
        delivery: request.effect.delivery,
        body: request.body,
      });
      request.afterEffect?.();
    }
    return { status: route.status, body: structuredClone(route.responseBody) };
  }
}
