# RetryProof — Devpost submission copy

> Final local draft. Replace bracketed URLs and the `/feedback` ID only after those external artifacts actually exist. Do not paste the bracketed placeholders into Devpost.

## Title

RetryProof

## Tagline

Break your automation before retries do.

## Track

Developer Tools

## Short description

RetryProof imports a sanitized n8n workflow, lets GPT-5.6 propose a user-approved reliability contract, deterministically exposes retry failures, and asks Codex for a bounded repair that must pass the identical fault fixture before it earns a green receipt.

## Approximately 100 words

One lost webhook response can make an automation repeat a consequential side effect. RetryProof turns that hidden risk into a reproducible flight test. It sanitizes a supported n8n workflow, then GPT-5.6 proposes the side effect, business key, invariant, and relevant retry scenarios. A human approves the contract before any test runs. RetryProof’s deterministic simulator injects a declared fault and records a red counterexample—two synthetic refund effects for one event. Codex prepares a tightly bounded reservation patch and exact regression fixture. The validator applies both to the imported snapshot and reruns the same event, seed, fault, and two deliveries, producing one effect and a reviewable green receipt.

## Longer project description

### The problem

Automation retries are necessary, but a response can disappear after a consequential write already succeeded. When the delivery is retried, an apparently healthy workflow can repeat a refund, notification, provisioning action, or back-office mutation. Happy-path testing rarely makes this failure visible, while broad claims such as “exactly once” are not defensible without system-specific assumptions.

### The solution

RetryProof is a mock-only reliability workbench for a pinned declarative slice of n8n. It imports workflow JSON in memory, strips credential references and non-executable metadata, rejects inline secrets, and reports exact compatibility coverage. GPT-5.6 receives only the canonical sanitized graph and proposes a structured risk contract: consequential effect, candidate business key, invariant, and supported fault scenarios. The model cannot run a test or issue a verdict. A human must approve the invariant first.

The deterministic simulator then executes only declared node semantics, mock HTTP routes, a logical clock, a reservation store, and a side-effect ledger. In the seeded refund scenario, delivery one records a mock refund and loses the response. The same event is delivered again. Before repair, the ledger records two refund effects for `evt_refund_001`, so the approved at-most-once invariant fails.

In an explicitly enabled trusted-local run, Codex works in a bounded temporary workspace with network access disabled. It may write only a structured repair artifact: a bounded RFC 6902 patch, manifest, explanation, and the exact approved regression fixture. Deterministic validation checks the source hash, invariant ID, patch paths, graph structure, secret safety, manifest change claims, and fixture identity. RetryProof then translates the exact patched graph and reruns the same event, seed, scenario, and two deliveries. The repaired run records one mock refund and passes the declared invariant. The deployed judge path uses the accurately labeled cached repair because RetryProof does not claim same-UID process isolation.

The downloadable receipt binds source, fixture, before/after workflows, scenarios, traces, patch, coverage, and explicit limitations. A green receipt means only that the approved invariant passed the declared deterministic scenarios. RetryProof never claims exactly-once execution or production safety and never performs a real external action.

### Why GPT-5.6 and Codex are central

GPT-5.6 performs the semantic work ordinary rule matching cannot do reliably across differently named and mapped workflows: it proposes which supported write is consequential, traces a plausible business key, cites exact graph evidence, and selects relevant supported faults. Grounding code rejects invented nodes and paths, and the user owns approval.

Codex performs constrained repository-like repair work rather than chat: it reads sanitized workflow, failure trace, invariant, and a machine-readable repair contract; emits a minimal patch plus regression artifact; and is accepted only after deterministic validation and red-to-green execution. GPT-5.6 proposes, Codex repairs, deterministic software proves.

### What judges can run

The hosted judge path requires no account and no rebuild. Select **Try refund demo**, inspect the sanitized six-node snapshot, approve the at-most-once invariant, run **Timeout after effect**, review the red two-effect trace, generate the labeled repair, and rerun. The evidence view shows the same event, seed, scenario, and two deliveries changing from two effects to one.

## How we built it

RetryProof is a TypeScript/Next.js application with strict Zod contracts at every untrusted boundary. The importer canonicalizes a pinned n8n subset and fails closed on unsupported executable nodes. GPT-5.6 uses the OpenAI Responses API with structured output and no tools. The simulator is a deterministic state machine with mock adapters, explicit fault phases, logical time, a side-effect ledger, and an invariant oracle. In trusted-local verification, Codex uses the Codex SDK in a temporary workspace with disabled network/web search, no interactive approval, a bounded output contract, and a one-run loopback credential proxy. PostgreSQL stores signed anonymous sessions and short-lived sanitized records; a tracked migration runner and schema-aware readiness endpoint protect startup. Docker packages the non-root production service in cached-repair mode.

Codex accelerated scaffolding, implementation across import/simulator/platform/UI boundaries, test generation, repair-contract design, documentation, and verification. The key human decisions were to narrow the supported semantics, keep all effects mock-only, require approval before testing, bind repair to the exact failure fixture, and give verdict authority only to deterministic code.

## Challenges we ran into

- Binding the green result to the exact graph shown to the user, rather than a pre-authored repaired simulator fixture.
- Preserving retry semantics while translating a reservation-plus-branch n8n graph into deterministic executable nodes.
- Letting Codex be useful without letting it execute untrusted workflow data, use the network, or broaden its patch surface.
- Making cached judge mode reliable without representing cached agent artifacts as newly generated.
- Keeping every claim bounded to a declared fault model instead of drifting into “exactly once” or production-certification language.

## Accomplishments

- A complete five-stage product journey from import through downloadable evidence.
- A reproducible red-to-green proof: two deliveries create two mock effects before repair and one after repair.
- Live GPT-5.6 structured analysis with grounded node evidence.
- Trusted-local live Codex repair accepted by a strict patch and regression-fixture validator.
- Exact source/fixture/scenario binding across before and after executions.
- Secret rejection, credential-reference stripping, human approval, rate limits, expiring sessions, and mock-only execution.
- A PostgreSQL-backed non-root Docker image with repeatable migrations and readiness checks.

## What we learned

Models are most valuable here when their authority is deliberately limited. GPT-5.6 is strong at proposing a semantic contract from a graph, and Codex is strong at producing a coherent multi-artifact repair. Neither should decide whether the system is correct. The memorable result comes from composing those capabilities with explicit approval, deterministic execution, strict validation, and honest evidence boundaries.

## What is next

- Expand the pinned declarative support matrix one node contract at a time.
- Add more invariant oracles beyond at-most-once effects.
- Publish a larger labeled semantic evaluation set before making production-quality inference metrics.
- Add provider-specific reservation setup assistants while keeping credentials and real effects outside RetryProof.
- Integrate evidence receipts into pull-request review and CI for supported workflows.

## Technology list

- OpenAI GPT-5.6 through the Responses API
- OpenAI Codex SDK
- TypeScript
- Next.js 16 and React 19
- Zod structured schemas
- PostgreSQL
- Docker
- Vitest and Testing Library
- RFC 6902 JSON Patch
- n8n declarative workflow exports

## URLs and required identifiers

- Hosted demo: `[DEPLOYED_HTTPS_URL]`
- Repository: `https://github.com/marmar9615-cloud/RetryProof`
- Public YouTube video: `[YOUTUBE_URL]`
- Majority-core Codex `/feedback` Session ID: `[FEEDBACK_SESSION_ID]`

## Judging-criteria mapping

### Technological Implementation

GPT-5.6 and Codex each have a real, distinct, constrained role. The imported and repaired graphs are exact; deterministic code owns every verdict; the final Docker/PostgreSQL path is runnable and tested.

### Design

The product is a coherent five-stage workbench, not a chat surface or isolated proof of concept. It has first-run guidance, approval gates, loading/error states, repair review, evidence download, cached/live provenance, and judge-ready synthetic data.

### Potential Impact

RetryProof addresses a specific expensive failure mode for automation builders: duplicated consequential side effects after retries. It turns an invisible risk into a visible counterexample and a reviewable repair without touching production systems.

### Quality of the Idea

The differentiated wedge is a model-assisted but deterministically adjudicated flight test. The same event, seed, fault, and deliveries are bound across red and green runs, while every screen repeats the evidence limitations.
