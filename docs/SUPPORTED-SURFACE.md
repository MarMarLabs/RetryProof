# Supported surface

This document is the compatibility contract, not a roadmap. Anything outside it fails closed on the tested path.

## n8n import envelope

- UTF-8 JSON only
- Maximum upload size: 1 MiB
- Maximum JSON depth: 64
- Maximum nodes: 256
- Maximum graph edges: 2,048
- Unique node IDs and names
- Connections must reference existing node names
- Strict top-level and node schemas; unknown envelope fields are rejected
- Pinned internal import contract: `retryproof-n8n-export-v1`

Raw uploads are parsed in memory. Credential references are counted and removed. Notes, pin data, static data, tags, and metadata are removed. Suspected inline secrets reject the import before canonicalization.

## Supported n8n node contracts

| Kind | n8n type | Supported `typeVersion` | Additional constraints |
|---|---|---|---|
| Webhook | `n8n-nodes-base.webhook` | 2, 2.1 | Method is GET/POST/PUT/PATCH/DELETE; nonempty literal path |
| Set | `n8n-nodes-base.set` | 3.3, 3.4 | `mode` absent or `manual`; expressions use the narrow grammar |
| If | `n8n-nodes-base.if` | 2, 2.1, 2.2 | Conditions object required; narrow expressions only |
| Switch | `n8n-nodes-base.switch` | 3, 3.1, 3.2 | Rules object required; narrow expressions only |
| HTTP Request | `n8n-nodes-base.httpRequest` | 4.1, 4.2 | Literal GET/POST/PUT/PATCH/DELETE and nonempty URL; real network is never called |
| PostgreSQL | `n8n-nodes-base.postgres` | 2.5, 2.6 | Only the exact RetryProof reservation query and replacement expression |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | 1.3, 1.4 | Response values remain JSON data; narrow expressions only |

The reservation query is fixed to an `INSERT ... ON CONFLICT DO NOTHING ... RETURNING entity_key` contract. Arbitrary SQL is rejected.

## Supported expression grammar

Accepted:

- JSON primitives as literals;
- one complete n8n expression of the form `={{ $json.event.id }}`;
- dot or bracket property access rooted only at `$json`;
- at most 32 path segments.
- array indexes from 0 through 256; larger sparse indexes fail closed.

Rejected:

- interpolation such as `customer-{{ $json.id }}`;
- function calls, operators, conditionals, globals, environment access, or `$node` references;
- `__proto__`, `prototype`, or `constructor` path segments;
- arbitrary JavaScript or Code nodes.

## Tested-path policy

Compatibility is computed in two directions:

1. from selected Webhook entry nodes to reachable nodes;
2. when targets are selected, backward from each target.

Unsupported nodes block execution only when they lie on the resulting tested path. Unsupported disconnected editor debris is reported but does not silently widen coverage. Missing entries, unknown targets, or unreachable targets block execution.

## Deterministic simulator node model

After import and analysis, RetryProof's simulator uses its own strict domain model:

- `webhook`
- `set`
- `if`
- `switch`
- `http_request`
- `reservation`
- `respond`

This is not a claim of full n8n emulation. Nodes are translated only when a supported contract exists.

## Fault scenarios

| Scenario | Fault phase | Behavior |
|---|---|---|
| Duplicate delivery | `before_replayed_delivery` | The same business event is delivered twice. |
| Effect succeeded then timeout | `after_effect_before_response` | Delivery one records the effect, loses its response, then delivery two retries. |
| Rate limited then retry | `before_effect` | Delivery one fails before the effect; a later delivery retries. |
| Partial failure then retry | `after_node` | Delivery one fails after the selected node; a later delivery retries. |

Each scenario contains a target node, delivery count, expected invariant IDs, and seed. Unknown phases or mismatched target types are rejected.

## Current invariant oracle

RetryProof currently supports one executable oracle:

```text
at_most_once_effect(effectId, keyPath, maximum = 1)
```

The supported `keyPath` is exactly `$.key`. The user must approve it. The oracle counts side effects by business key in the deterministic ledger and reports maximum observed count and violating keys.

## Explicit non-support

- arbitrary n8n nodes or community nodes;
- n8n Code nodes;
- real network access or production credentials;
- arbitrary SQL or a real database transaction model;
- queues, webhook providers, or platform retry timing outside the declared scheduler;
- semantic equivalence with n8n Cloud or self-hosted n8n;
- proof across crashes between a real side effect and a real reservation commit;
- exactly-once execution or production-safety certification.

If a behavior is not listed as supported, RetryProof does not approximate it.
