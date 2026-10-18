# Privacy and data retention

> This document describes the standalone reference implementation. The submitted integrated product additionally sends only the sanitized repair bundle to a separate private worker; that worker receives no MarMarLabs database, authentication, billing, GitHub, or unrelated product credentials.

## Data-minimization promise

RetryProof is designed for synthetic or scrubbed workflows. A workflow export can still reveal endpoint URLs, credential references, customer examples, and operational logic, so the safest input is the smallest synthetic reproduction.

## Data lifecycle

| Data | Local processing | Persisted | Default retention |
|---|---|---|---|
| Raw uploaded bytes | Parsed in memory | No | Request lifetime only |
| Credential references | Counted, then removed | No | None |
| Suspected inline secret | Location detected; import rejected | No value stored | None |
| Notes, pin/static data, metadata, tags | Removed | No | None |
| Sanitized canonical graph | Yes | Session scoped | 24 hours |
| Synthetic fixture | Yes | Session scoped | 24 hours |
| Risk plan and approval | Yes | Session scoped | 24 hours |
| Trace, ledger, verdict, hashes | Yes | Session scoped | 24 hours |
| Repair artifacts | Yes | Session scoped and user downloadable | 24 hours |
| Audit/log event | IDs, hashes, timings, counts, error codes only | Yes | Deployment policy; no bodies |
| Seeded demo | Synthetic | Shipped with application | Until removed in a release |

The user may delete the session immediately. Expiry cleanup removes sessions and related records through database cascades.

## Model data

Live GPT-5.6 receives only the canonical supported subgraph and the minimum synthetic context needed for analysis. It does not receive raw uploads, stripped credential references, rejected secret values, or hidden reasoning storage requests. RetryProof persists the structured result and request metadata, not chain of thought.

Live Codex is restricted to an explicitly enabled trusted-local, non-production run. It receives a sanitized repair bundle in a temporary directory, and its child environment contains only minimum runtime variables plus a random one-run loopback proxy token. The reusable OpenAI key remains in the parent process and is never copied into the workspace. This is not described as process isolation: a same-UID child may inspect parent state on common Linux hosts, so production rejects live Codex repair until it can run in a separately isolated worker.

Cached mode sends no analysis or repair request for the seeded artifact and is visibly labeled cached.

## User consent and disclosure

Before upload, the interface should state:

- upload synthetic or scrubbed data only;
- raw input is parsed in memory;
- credential references are stripped;
- suspected inline secrets cause rejection;
- sanitized session artifacts expire after 24 hours;
- live mode sends the sanitized supported graph to OpenAI;
- no real external action is performed;
- generated repairs require human review.

## Logs and analytics

Allowed fields:

- random request/session/job IDs;
- source, plan, trace, patch, and artifact hashes;
- counts and compatibility ratios;
- mode (`cached` or `live`), model name, prompt version;
- latency, token counts, status, and stable error code;
- approval and artifact-download timestamps.

Disallowed fields:

- raw or sanitized workflow bodies;
- fixture payloads;
- endpoint query strings containing user data;
- secret values or authorization headers;
- model hidden reasoning;
- full Codex workspace contents.

## Deployment operator responsibilities

- choose and document the log-retention window;
- configure encrypted PostgreSQL and TLS;
- restrict database and deployment-console access;
- rotate signing and API credentials;
- verify expiry cleanup executes;
- provide an operator contact and deletion route;
- avoid adding third-party analytics that collect workflow content.

## No regulated-data claim

RetryProof is not presented as HIPAA, PCI DSS, FERPA, GDPR, or other regulatory compliance tooling. Do not upload protected health information, payment card data, student records, real customer data, or legally restricted material. The demo uses synthetic values only.
