import {
  N8N_NODE_TYPES,
  POSTGRES_RESERVATION_QUERY,
  type N8nWorkflowExport,
} from "@/lib/n8n";

export function makeSupportedWorkflow(): N8nWorkflowExport {
  return {
    id: "wf_demo_refund",
    name: "RetryProof refund demo",
    active: false,
    versionId: "version_demo_1",
    nodes: [
      {
        id: "webhook",
        name: "Refund webhook",
        type: N8N_NODE_TYPES.webhook,
        typeVersion: 2.1,
        position: [0, 0],
        parameters: {
          httpMethod: "POST",
          path: "retryproof-refund",
          responseMode: "responseNode",
        },
      },
      {
        id: "set",
        name: "Map event",
        type: N8N_NODE_TYPES.set,
        typeVersion: 3.4,
        position: [200, 0],
        parameters: {
          mode: "manual",
          assignments: {
            assignments: [
              {
                id: "event-id",
                name: "eventId",
                type: "string",
                value: "={{ $json.event.id }}",
              },
            ],
          },
        },
      },
      {
        id: "if",
        name: "Is refund",
        type: N8N_NODE_TYPES.if,
        typeVersion: 2.2,
        position: [400, 0],
        parameters: {
          conditions: {
            options: {},
            conditions: [
              {
                leftValue: "={{ $json.event.type }}",
                rightValue: "refund.requested",
                operator: { type: "string", operation: "equals" },
              },
            ],
          },
        },
      },
      {
        id: "reservation",
        name: "Reserve refund",
        type: N8N_NODE_TYPES.postgres,
        typeVersion: 2.6,
        position: [600, 0],
        parameters: {
          operation: "executeQuery",
          query: POSTGRES_RESERVATION_QUERY,
          options: {
            queryReplacement: "={{ $json.retryProofReservationValues }}",
          },
        },
      },
      {
        id: "http_refund",
        name: "Create refund",
        type: N8N_NODE_TYPES.httpRequest,
        typeVersion: 4.2,
        position: [800, 0],
        parameters: {
          method: "POST",
          url: "https://mock.retryproof.local/refunds",
          sendBody: true,
          contentType: "raw",
          rawContentType: "application/json",
          body: "={{ $json.event }}",
        },
        credentials: {
          httpHeaderAuth: { id: "credential-ref-1", name: "Demo API" },
        },
      },
      {
        id: "respond",
        name: "Respond",
        type: N8N_NODE_TYPES.respondToWebhook,
        typeVersion: 1.4,
        position: [1000, 0],
        parameters: {
          respondWith: "json",
          responseBody: "={{ $json.result }}",
        },
      },
    ],
    connections: {
      "Refund webhook": {
        main: [[{ node: "Map event", type: "main", index: 0 }]],
      },
      "Map event": {
        main: [[{ node: "Is refund", type: "main", index: 0 }]],
      },
      "Is refund": {
        main: [[{ node: "Reserve refund", type: "main", index: 0 }], []],
      },
      "Reserve refund": {
        main: [[{ node: "Create refund", type: "main", index: 0 }]],
      },
      "Create refund": {
        main: [[{ node: "Respond", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
    meta: { templateCredsSetupCompleted: true },
    tags: [],
  };
}

export function workflowJson(): string {
  return JSON.stringify(makeSupportedWorkflow());
}
