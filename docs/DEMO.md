# Demo and fallback plan

## Official recording target: 1 minute 59 seconds

The OpenAI Build Week submission video must be public on YouTube and strictly under three minutes. The production cut uses a concise 1:59 narration and compresses only the live-worker wait. All contract, red verdict, accepted repair, green replay, receipt, and limitation states remain readable at normal speed.

| Time | Visible action | Exact voiceover |
|---|---|---|
| 0:00–0:27 | Open on the product promise, load the seeded workflow, and show the execution boundary. | Hook, synthetic import, secret boundary, and mock-only execution. |
| 0:27–0:53 | Show the cached GPT-5.6 seeded contract and explicitly approve the invariant. | Honest seeded provenance; GPT-5.6 proposes, a human approves. |
| 0:53–1:07 | Run timeout-after-effect and keep the red oracle visible. | Two deliveries create two effects for one event. |
| 1:07–1:28 | Start the fresh Codex repair; compress only the wait; show acceptance by validators. | Bounded repair artifact; deterministic validator owns acceptance. |
| 1:28–1:43 | Show the identical replay and `2 → 1`, fail → pass. | Same event, seed, fault, and deliveries. |
| 1:43–1:59 | Hold on the evidence receipt and explicit limitation statement. | Bound hashes, evidence, limitations, and close. |

## Central visual proof

Keep these values on one screen for at least three seconds:

| Field | Before | After |
|---|---:|---:|
| Source event | `evt_refund_001` | `evt_refund_001` |
| Scenario | `timeout_after_refund` | `timeout_after_refund` |
| Seed | `demo-v1` | `demo-v1` |
| Deliveries | 2 | 2 |
| Refund effects | 2 | 1 |
| Invariant | Fail | Pass |

This proves the repair against one declared model. It does not prove production exactly-once semantics.

## Prepared demo data

- [refund-workflow.json](../fixtures/demo/refund-workflow.json): valid, synthetic n8n export
- [stripe-event.json](../fixtures/demo/stripe-event.json): Stripe-like synthetic event; no real Stripe data
- [approved-invariant.json](../fixtures/demo/approved-invariant.json): human-approved at-most-once contract
- [scenarios.json](../fixtures/demo/scenarios.json): four supported scenarios
- deterministic simulator fixtures under `fixtures/simulator/`

No n8n Cloud, Stripe account, customer record, credential, or real endpoint is required.

## Rehearsal

```bash
npm run demo:rehearse
```

The script runs the critical timeout scenario ten times, requires byte-identical red traces across all runs, verifies two effects before repair and one after, and checks the green trace is also repeatable.

Before recording:

- run all checks and the production build;
- complete ten UI rehearsals from a clean browser profile;
- use 1080p or 1440p, visible cursor, and 125–150% zoom;
- disable notifications and password-manager overlays;
- capture clear voiceover and captions;
- verify no terminal, API key, email, customer data, or private URL is visible;
- keep duration below 2:55 before upload;
- verify public visibility and playback in incognito.

## Live dependency fallback

### GPT-5.6 unavailable

Switch `DEMO_MODEL_MODE=cached`. Show the explicit **Cached demonstration analysis** label. Let the user inspect and approve the plan, then run the simulator live. Do not say the cached plan was generated during the recording.

### Codex unavailable

Switch `CODEX_REPAIR_MODE=cached`. Show **Cached demonstration repair**, source hash, manifest, and limitations. Run patch validation and deterministic recheck live. Do not imply a new Codex thread ran.

### Database unavailable

For a local recording, omit `DATABASE_URL` and use the deterministic ephemeral store. State that the recorded seeded session is ephemeral. Do not represent it as the hosted production persistence path.

### UI animation or polling fails

- keep a direct seeded route or fresh local session ready;
- use static status labels rather than waiting on animation;
- retain screenshots of import, contract, red trace, repair, and green evidence;
- keep downloaded evidence JSON ready for a cutaway;
- do not splice two different seeds or scenario IDs into the before/after comparison.

## Recording fallback

- Primary cut: 1:59, full journey with the live-worker wait compressed.
- Safety cut: 1:50, shorten the hero and contract holds only.
- Never omit: approval gate, red trace, Codex repair provenance, identical green rerun, limitation statement.
- If a live call is unreliable after one bounded retry, use cached mode and record the provenance label.
