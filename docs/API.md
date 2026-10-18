# API and error contracts

> This document describes the standalone reference API in this repository. The submitted production API is the namespaced `/api/retryproof/v1/*` surface in the integrated MarMarLabs repository linked from the root README.

The browser API is session scoped. State-changing requests use a signed anonymous session, CSRF token, ownership checks, rate limits, and idempotency where replay would be harmful.

## Intended endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/workflows` | Parse, scan, sanitize, canonicalize, and report compatibility. |
| `POST` | `/api/v1/workflows/:id/analyses` | Queue cached or live structured analysis. |
| `GET` | `/api/v1/jobs/:id` | Poll owned job state. |
| `PATCH` | `/api/v1/analyses/:id/plan` | Edit or approve a plan using `If-Match`. |
| `POST` | `/api/v1/analyses/:id/scenarios` | Save supported, approved scenarios. |
| `POST` | `/api/v1/analyses/:id/executions` | Execute a deterministic suite. |
| `POST` | `/api/v1/analyses/:id/repairs` | Queue a cached repair, or a live Codex repair in an explicitly enabled trusted-local environment. |
| `POST` | `/api/v1/repairs/:id/recheck` | Validate and rerun the exact scenario. |
| `GET` | `/api/v1/artifacts/:id` | Read owned artifact metadata. |
| `GET` | `/api/v1/artifacts/:id/download` | Download an owned, approved artifact. |
| `DELETE` | `/api/v1/session` | Delete the current short-lived session. |

Consult the actual route source before integrating; this document describes the stable public contract and must not be used to claim an unimplemented endpoint in submission copy.

## Import result

```json
{
  "workflowId": "wf_01",
  "sourceHash": "8ee643af...",
  "coverage": { "supported": 6, "total": 6, "ratio": 1 },
  "unsupported": [],
  "credentialReferencesRemoved": 1,
  "inlineSecrets": []
}
```

## Approving a plan

```http
PATCH /api/v1/analyses/an_01/plan
Content-Type: application/json
If-Match: 69c12f...
X-CSRF-Token: <session token>
```

```json
{
  "planVersion": 1,
  "invariants": [
    {
      "id": "inv_refund_once",
      "oracleType": "at_most_once_effect",
      "effectId": "refunds",
      "keyPath": "$.key",
      "maximum": 1
    }
  ],
  "approved": true
}
```

## Executing a suite

```http
POST /api/v1/analyses/an_01/executions
Content-Type: application/json
Idempotency-Key: execution-wf01-plan1-demo-v1
X-CSRF-Token: <session token>
```

```json
{
  "scenarioIds": ["duplicate_delivery", "timeout_after_refund"],
  "seed": "demo-v1"
}
```

Repeating the same key with the same request body replays the completed response. Reusing it with a different body returns a conflict.

## Error envelope

```json
{
  "error": {
    "code": "UNSUPPORTED_NODE_ON_PATH",
    "message": "The tested path contains an unsupported Code node.",
    "details": {
      "nodeId": "node_7",
      "jsonPath": "$.nodes[6].type"
    },
    "requestId": "req_01"
  }
}
```

Errors may reveal safe IDs, counts, limits, and JSON paths. They must never echo credential or suspected secret values.

| Status | Meaning |
|---:|---|
| 400 | Malformed request or JSON |
| 401 | Missing or invalid session |
| 403 | Session does not own the resource or CSRF failed |
| 409 | Stale plan hash or idempotency conflict |
| 413 | Upload exceeds 1 MiB |
| 422 | Secret, unsupported path, invalid patch, or failed validation |
| 429 | Per-session or shared service budget reached; honor `Retry-After` |
| 503 | Live OpenAI or Codex dependency unavailable |

## Default limits

- Imports: 10 per hour per session
- GPT-5.6 analyses: 5 per hour per session
- Codex repairs: 3 per hour per session
- Live GPT-5.6 analyses: 60 per hour across the store
- Live Codex repairs: 20 per hour across the store
- Live OpenAI 429/5xx retries: at most two bounded retries
- Completed jobs are not re-executed
- Stale worker locks may be reclaimed
