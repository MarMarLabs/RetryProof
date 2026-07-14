# RetryProof demo transcript — target 2:45

## 0:00–0:12 — Hook

This workflow passes its happy path. But when one webhook response disappears, the same refund happens twice. RetryProof turns that hidden retry bug into a reproducible flight test.

## 0:12–0:30 — Import

I load a synthetic n8n refund workflow. RetryProof parses it in memory, removes credential references, rejects inline secrets, and reports exact support coverage. Every external call is a deterministic mock.

## 0:30–0:52 — GPT-5.6 contract

GPT-5.6 reads only the sanitized supported graph. It identifies the refund as consequential, traces `event.id` as the business key, cites existing nodes and mappings, and proposes the faults worth testing. The model proposes; it cannot run a test or issue a verdict.

## 0:52–1:02 — Human approval

I approve the invariant: at most one refund effect per event ID. Nothing executes before this human decision.

## 1:02–1:27 — Red counterexample

Now I inject timeout after effect. Delivery one records the mock refund, then loses the response. The same event is delivered again. The ledger proves two refund effects for `evt_refund_001`, so the deterministic oracle fails the contract.

## 1:27–1:57 — Codex repair

Codex receives the sanitized snapshot, approved invariant, and exact failing trace inside a network-disabled workspace. It can write only a bounded patch and regression artifact. Here it inserts a durable reservation before the refund, preserves the duplicate acknowledgment path, and adds the event ID as provider idempotency key. Local validators—not Codex—check every patch path, hash, node, secret boundary, and fixture.

## 1:57–2:23 — Identical green rerun

I rerun the exact regression fixture. Same event. Same `demo-v1` seed. Same timeout phase. Same two deliveries. Before repair: two refund effects and fail. After repair: one refund effect and pass. That controlled difference is the proof.

## 2:23–2:36 — Evidence

The receipt binds source, fixture, scenarios, traces, repair, coverage, and limitations. Judges can download the complete artifact without a real payment account or production credential.

## 2:36–2:42 — Close

GPT-5.6 proposes. Codex repairs. Deterministic software proves. RetryProof: break your automation before retries do.

## 2:42–2:45 — Evidence hold

No narration. Hold on the green evidence receipt and its explicit limitation statement.
