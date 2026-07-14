# RetryProof submission-candidate verification

Verified locally on **July 14, 2026 at 8:02 AM CDT**. This is evidence for the local candidate, not a claim that any repository, deployment, video, or Devpost entry has been published.

## Product and deterministic proof

- `npm test`: **27 files, 120 tests passed**.
- `npm run test:e2e`: **1 full component journey passed**.
- `npm run eval:golden`: **4/4 deterministic golden cases passed**, seed `golden-v1`.
- `npm run demo:rehearse`: **10/10** identical seeded rehearsals passed; `timeout_after_refund` remained `2 deliveries / 2 effects / fail` before repair and `2 deliveries / 1 effect / pass` after repair.
- Ten separate clean Safari UI journeys also reached the exact `evt_refund_001 · timeout_after_refund · 2 deliveries` green receipt.
- Production HTTP journey against the final Docker image passed: cached analysis, approval, enforced rejection of production live Codex, red 2, Codex-labeled cached repair, green 1, ZIP artifact, session deletion.

## Live agent boundaries

- `npm run verify:live:openai` passed against `gpt-5.6-sol`: one consequential side effect, one invariant, four supported scenarios, and node-grounded evidence. A live request ID was present. GPT-5.6 remained read-only and did not issue a verdict.
- `npm run verify:live:codex` passed in a trusted local environment: a live Codex thread was present, seven bounded operations were returned for `durable_reservation_before_effect`, five workflow nodes changed, and local validators accepted the resulting eight-node graph plus exact regression fixture. Codex did not own the pass/fail verdict. Production live repair is disabled pending a separately isolated worker.
- Raw request/thread IDs and credentials are intentionally not copied into this document.

## Build, package, and security

- `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build` passed.
- A separate clean-package copy, containing neither `.env.local` nor the private research plan, passed install, lint, typecheck, all 120 tests, production build, and asset verification.
- `npm run security:secrets` scanned **187 text files** and found no unknown credential-shaped values; four exact fake canaries in sanitizer/adversarial tests were allowlisted.
- `.env.local` is ignored, mode `600`, and absent from the candidate package. The private research plan is also ignored.
- `npm audit --omit=dev` reports **0 vulnerabilities**.
- All direct runtime dependencies declare permissive licenses (Apache-2.0, MIT, ISC, or Unlicense).

## Production container and database

- Image: `retryproof:devpost-ready-final`.
- Local manifest-list digest: `sha256:9d2e73fddbb469c3897a5865351d885d126d88b3d05bb67f7f087e4f3c816f31`.
- Runtime user: `retryproof` (non-root).
- Image inspection confirmed no embedded OpenAI key, database URL, signing secret, `.env.local`, private research plan, tests, docs, or submission media.
- PostgreSQL 16 readiness: `ready=true`, `storage=postgres`, `schema=ready`, `appliedMigrations=3`.
- A repeated startup skipped the three already-applied, hash-verified migrations and then started normally.
- The Docker build context excludes every `.env*` file, private research, tests, docs, and submission media.

## Submission media

- Final video: `submission/video/retryproof-demo-final.mp4`.
- Duration: **165.033333 seconds (2:45.033)**, inside the research plan's 2:45–2:55 release window and below the strict three-minute limit.
- Media: **1280×720 H.264 at 30 fps; 48 kHz stereo AAC**.
- Audio measurement: **-19.3 dB mean / -4.7 dB max**.
- Captions end with the narration at **2:42.000**, followed by a three-second silent evidence hold.
- Six 1366×768 screenshots and one 1280×720 thumbnail passed the asset verifier.
- Exact sizes and SHA-256 digests are recorded in `submission/asset-manifest.json`.

## Intentionally unresolved external proof

The following are false until performed with the user's explicit approval: public repository, hosted HTTPS demo, public YouTube playback, `/feedback` Session ID, Devpost draft completion, and Devpost submission confirmation. See `submission/EXTERNAL-HANDOFF.md` for the exact sequence.
