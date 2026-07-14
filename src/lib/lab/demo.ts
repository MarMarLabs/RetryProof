import fixtureJson from "../../../fixtures/simulator/refund-fixture.json";

import { simulationFixtureSchema, type SimulationFixture } from "@/lib/simulator";
import type { N8nWorkflowExport } from "@/lib/n8n";

export const DEMO_N8N_WORKFLOW: N8nWorkflowExport = {
  id: "wf_demo_refund",
  name: "Refund request - unsafe retry",
  active: false,
  versionId: "n8n-1.102-demo",
  nodes: [
    {
      id: "webhook_refund",
      name: "Refund webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [180, 300],
      parameters: { path: "refund-requested", httpMethod: "POST" },
    },
    {
      id: "normalize_event",
      name: "Normalize event",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [380, 300],
      parameters: {
        mode: "manual",
        assignments: {
          assignments: [
            {
              id: "event",
              name: "event",
              type: "object",
              value: "={{ $json.event }}",
            },
          ],
        },
      },
    },
    {
      id: "check_event",
      name: "Check event",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [580, 300],
      parameters: {
        conditions: {
          string: [{ value1: "={{ $json.event.id }}", operation: "isNotEmpty" }],
        },
      },
    },
    {
      id: "http_refund",
      name: "Create refund",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [780, 300],
      parameters: {
        method: "POST",
        url: "mock://refunds",
        body: {
          event_id: "={{ $json.event.id }}",
          amount: "={{ $json.event.amount }}",
        },
        headers: {},
      },
    },
    {
      id: "respond_ok",
      name: "Acknowledge",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [980, 300],
      parameters: { respondWith: "json", responseBody: "received" },
    },
    {
      id: "audit_record",
      name: "Audit result",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [1180, 300],
      parameters: { mode: "manual", values: { result: "acknowledged" } },
    },
  ],
  connections: {
    "Refund webhook": { main: [[{ node: "Normalize event", type: "main", index: 0 }]] },
    "Normalize event": { main: [[{ node: "Check event", type: "main", index: 0 }]] },
    "Check event": {
      main: [
        [{ node: "Create refund", type: "main", index: 0 }],
        [{ node: "Acknowledge", type: "main", index: 0 }],
      ],
    },
    "Create refund": { main: [[{ node: "Acknowledge", type: "main", index: 0 }]] },
    Acknowledge: { main: [[{ node: "Audit result", type: "main", index: 0 }]] },
  },
};

export const DEMO_FIXTURE: SimulationFixture = simulationFixtureSchema.parse(fixtureJson);
