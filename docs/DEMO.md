# Demo and fallback plan

## Official recording target: 2 minutes 45 seconds

The OpenAI Build Week submission video must be public on YouTube and strictly under three minutes. Record the 2:42 narration in [submission/video/transcript.md](../submission/video/transcript.md), then hold on the evidence receipt for three silent seconds. The resulting 2:45 cut satisfies the project release target while preserving upload/transcode margin.

| Time | Visible action | Exact voiceover |
|---|---|---|
| 0:00–0:12 | Open on the red evidence summary: two deliveries, two refund calls. | Hook: a lost response repeats the refund. |
| 0:12–0:30 | Select **Try refund demo**; show sanitized import, coverage, and source hash. | Import, secret boundary, and mock-only execution. |
| 0:30–0:52 | Show the GPT-5.6 proposal, citations, key, scenarios, and provenance. | GPT-5.6 proposes; it does not judge. |
| 0:52–1:02 | Approve “At most one refund effect per event ID.” | Human approval owns the contract. |
| 1:02–1:27 | Run timeout-after-effect and keep the red oracle visible. | Two deliveries create two effects for one event. |
| 1:27–1:57 | Review Codex patch, exact fixture, checks, and provenance. | Bounded repair artifact; deterministic validator owns acceptance. |
| 1:57–2:23 | Rerun the identical fixture and show `2 → 1`, fail → pass. | Same event, seed, fault, and deliveries. |
| 2:23–2:36 | Show evidence receipt and artifact download. | Bound hashes, coverage, and limitations. |
| 2:36–2:42 | End on the green comparison. | “GPT-5.6 proposes. Codex repairs. Deterministic software proves.” |
| 2:42–2:45 | Hold on the evidence receipt and limitation statement. | No narration. |

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

- Primary cut: 2:45, full journey with a three-second evidence hold.
- Safety cut: 2:40, omit secondary scenarios and repository tour.
- Never omit: approval gate, red trace, Codex repair provenance, identical green rerun, limitation statement.
- If a live call is unreliable after one bounded retry, use cached mode and record the provenance label.
