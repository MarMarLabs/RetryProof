import type { ScenarioView, TraceEventView, WorkflowNodeView } from "./types";

export const DEMO_SOURCE_HASH = "8ee643af9007a228c0bf87d75183e34264eb02932eaa21be628bc365e38569e0";

export const DEMO_WORKFLOW: Record<string, unknown> = {
  id: "wf_demo_refund",
  name: "Refund request — unsafe retry",
  versionId: "n8n-1.102-demo",
  nodes: [
    {
      id: "webhook_refund",
      name: "Refund webhook",
      type: "n8n-nodes-base.webhook",
      position: [180, 300],
      parameters: { path: "refund-requested", httpMethod: "POST" },
    },
    {
      id: "normalize_event",
      name: "Normalize event",
      type: "n8n-nodes-base.set",
      position: [380, 300],
      parameters: { values: { event: { id: "={{ $json.event.id }}", amount: "={{ $json.amount }}" } } },
    },
    {
      id: "check_event",
      name: "Check event",
      type: "n8n-nodes-base.if",
      position: [580, 300],
      parameters: { conditions: { string: [{ value1: "={{ $json.event.id }}", operation: "isNotEmpty" }] } },
    },
    {
      id: "http_refund",
      name: "Create refund",
      type: "n8n-nodes-base.httpRequest",
      position: [780, 300],
      parameters: {
        method: "POST",
        url: "mock://refunds",
        body: { event_id: "={{ $json.event.id }}", amount: "={{ $json.amount }}" },
        headers: {},
      },
    },
    {
      id: "respond_ok",
      name: "Acknowledge",
      type: "n8n-nodes-base.respondToWebhook",
      position: [980, 300],
      parameters: { respondWith: "json", responseBody: "={\"received\":true}" },
    },
    {
      id: "audit_record",
      name: "Audit result",
      type: "n8n-nodes-base.set",
      position: [1180, 300],
      parameters: { values: { result: "acknowledged" } },
    },
  ],
  connections: {
    webhook_refund: { main: [[{ node: "normalize_event", type: "main", index: 0 }]] },
    normalize_event: { main: [[{ node: "check_event", type: "main", index: 0 }]] },
    check_event: { main: [[{ node: "http_refund", type: "main", index: 0 }]] },
    http_refund: { main: [[{ node: "respond_ok", type: "main", index: 0 }]] },
    respond_ok: { main: [[{ node: "audit_record", type: "main", index: 0 }]] },
  },
};

export const DEMO_FIXTURE = {
  event: { id: "evt_demo_17", type: "refund.requested", amount: 1299 },
  customer: "cus_demo_42",
  currency: "usd",
};

export const WORKFLOW_NODES: WorkflowNodeView[] = [
  { id: "webhook_refund", label: "Webhook", detail: "POST /webhook", kind: "trigger" },
  { id: "normalize_event", label: "Normalize", detail: "Set fields", kind: "transform" },
  { id: "check_event", label: "Check event", detail: "event.id exists", kind: "decision" },
  { id: "http_refund", label: "Refund", detail: "POST /refunds", kind: "effect" },
  { id: "respond_ok", label: "Respond", detail: "HTTP 200", kind: "response" },
  { id: "audit_record", label: "Audit", detail: "Record result", kind: "audit" },
];

export const RED_TRACE: TraceEventView[] = [
  { order: 1, time: "00:00.000", event: "delivery 1", detail: "event.id = evt_demo_17", node: "Webhook", outcome: "Received", tone: "neutral" },
  { order: 2, time: "00:00.120", event: "refund effect succeeds", detail: "POST /refunds → 201", node: "Refund", outcome: "Effect succeeded", tone: "fail" },
  { order: 3, time: "00:00.480", event: "response lost", detail: "Timeout after effect", node: "—", outcome: "Response lost", tone: "warn" },
  { order: 4, time: "00:05.012", event: "delivery 2 (retry)", detail: "same event redelivered", node: "Webhook", outcome: "Received", tone: "neutral" },
  { order: 5, time: "00:05.143", event: "refund effect succeeds again", detail: "POST /refunds → 201", node: "Refund", outcome: "Effect succeeded", tone: "fail" },
  { order: 6, time: "00:05.520", event: "response sent", detail: "HTTP 200 OK", node: "Respond", outcome: "Acknowledged", tone: "neutral" },
];

export const SCENARIOS: ScenarioView[] = [
  { id: "timeout_after_refund", name: "Timeout after refund effect", summary: "Effect succeeds, response is lost, provider retries.", before: { calls: 2, pass: false }, after: { calls: 1, pass: true } },
  { id: "duplicate_delivery", name: "Duplicate delivery", summary: "The same business event is delivered twice.", before: { calls: 2, pass: false }, after: { calls: 1, pass: true } },
  { id: "rate_limit_before_refund", name: "429 before effect", summary: "Provider rejects the call before any effect.", before: { calls: 0, pass: true }, after: { calls: 0, pass: true } },
  { id: "happy_path", name: "Happy path", summary: "One delivery and no injected fault.", before: { calls: 1, pass: true }, after: { calls: 1, pass: true } },
];

export const REPAIR_PATCH = [
  { op: "add", path: "/nodes/3", value: { id: "reserve_event_key", type: "retryproof.postgresReservation", name: "Reserve idempotency key" } },
  { op: "add", path: "/connections/reserve_event_key", value: { main: [[{ node: "http_refund", type: "main", index: 0 }]] } },
  { op: "replace", path: "/connections/check_event/main/0/0/node", value: "reserve_event_key" },
  { op: "add", path: "/nodes/4/parameters/headers/Idempotency-Key", value: "={{ $json.event.id }}" },
];
