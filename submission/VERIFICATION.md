# RetryProof submission verification

Production proof was refreshed on **July 20, 2026 CDT**. This file keeps local, source-control, production, artifact, and external-submission proof separate.

## July 20 final-release production proof

- Integrated feature commit `d2f04b6` adds the data-derived Black Box Replay, accessible completion focus/status, canonical receipt endpoint, and reproducibility capsule. Current personal-account remote main `14064a7` contains that commit and is tree-identical to verified source tree `13cc94d` after three Replit publish-only commits.
- The public app was guarded-republished without changing the private worker. `https://marmarlabs.com/`, `/api/healthz`, `/api/retryproof/v1/ready`, and `/retryproof/lab/` stayed HTTP 200 during the proof run.
- A clean anonymous session remained on **Import** after loading the seeded workflow and advanced only after **Analyze retry risk**. The proposal was honestly labeled `GPT-5.6-informed seeded contract` / `Seeded · cached`.
- Human approval preceded execution. The four-scenario deterministic suite produced the expected RED state with two mock effects for the retry-after-effect path.
- **Repair with live Codex** was selected exactly once. The UI showed signed **Worker accepted**, then **Fresh Codex · validators live**, one attempt, and no fallback. The fresh repair completed in about 34 seconds in the observed browser journey.
- Replaying the identical suite produced GREEN with one effect. All four scenario rows improved (`2→1`, `2→1`, `1→0`, `2→1`) under their original scenario IDs and fault phases.
- Black Box Replay paired the accepted `duplicate_delivery` traces, confirmed the first two events matched, and isolated event 3: `effect_replayed` before versus `reservation_conflict` after. Its own copy keeps the no-production-safety/no-exactly-once limitation visible.
- Canonical receipt: `submission/evidence/production-receipt-7443835dd9c7.json`, SHA-256 `7443835dd9c79481b977e1a644f9ccc3b74f507faf7c3065f8d72a736b849817`.
- Reproducibility capsule: `submission/evidence/production-capsule-7443835dd9c7.zip`, SHA-256 `3dba14b8cc2c160ebfdb41d12c519900035b157d068da7653e34f1ace5d37bab`.
- ZIP integrity passed. The archive contains 10 files total: `manifest.json` plus nine path-sorted payload entries. Every listed byte length and SHA-256 digest matched; the external canonical receipt is byte-identical to the capsule's `receipt.json`.
- The receipt records `before.effectCount=2`, `before.passed=false`, `after.effectCount=1`, `after.passed=true`, approved invariant `refunds_at_most_once`, `analysis=gpt-5.6-informed-template`, `repair=codex-live`, and `deterministicValidation=live`.
- `submission/screenshots/08-black-box-replay-production.png` is the clean 1366×768 production capture of the current evidence view. No credential, request body, private worker URL, or raw/unvalidated model output is included.
- The existing public video remains the verified baseline. Final repository/CI identifiers and the refreshed Devpost version 5 state are recorded below.

## Integrated production source

- Source repository: `marmar9615-cloud/Copilot-Checker`.
- Submitted implementation baseline: `2dd084c` (`Merge pull request #10`).
- Final judge-readable feature source: `d2f04b6`; verified deployed source tree: `13cc94d`; current remote main: tree-identical publish marker `14064a7`.
- The public Replit deployment was refreshed with the integrated source while the separate private worker remained unchanged.
- The public-app artifact manifests were checked before publishing: API server and NeverGuess declare production services; the private RetryProof worker does not claim the public app's production slot.

## Production health and live paths

- `https://marmarlabs.com/`, `https://marmarlabs.com/retryproof/lab/`, and both corresponding `copilot-checker.replit.app` URLs returned HTTP 200 after the final publish.
- `GET /api/retryproof/v1/ready` returned `ready:true`, PostgreSQL storage, `cachedJudgePath:true`, `customWorkflowPath:true`, `liveAnalysisConfigured:true`, and `liveCodexConfigured:true`.
- A supported custom four-node workflow exercised the production live-analysis path. The returned provenance was `live`, model `gpt-5.6-sol`, with grounded workflow coverage and no model-owned verdict.
- The seeded production judge path was run from a clean anonymous session: analyze, human approval, deterministic red suite, one fresh live Codex repair, validator acceptance, identical replay, and evidence receipt.
- The latest live Codex repair completed in about 34 seconds. The UI showed signed worker acceptance, a fresh thread, one attempt, validator acceptance, and no fallback provenance.
- The identical deterministic replay changed the declared timeout scenario from two mock effects to one while keeping the event, fixture, seed, fault, and two deliveries fixed.
- Current production evidence receipt SHA-256: `7443835dd9c79481b977e1a644f9ccc3b74f507faf7c3065f8d72a736b849817`.

## Integrated test evidence

- NeverGuess frontend: **23/23 tests passed**, typecheck passed, production build passed.
- API server: **130 passed / 20 skipped**.
- RetryProof worker: **10 passed / 1 gated live spec skipped**, typecheck passed, build passed.
- The final production copy states that a live repair is typically one to three minutes and may take up to about six within the fail-closed budget.
- Standalone submission-source commit `fada0adf630891551a01e8aabc21968aa55c5a9b` passed GitHub Actions run `29790585629`: both the full `verify` job and the independent `component-journey` job completed successfully.

## Security and publication boundary

- A fresh `gitleaks dir --redact` scan of the exact integrated source tree found **zero findings**.
- A targeted credential-pattern scan found only secret-name strings in tests, not credential values.
- Production credentials, model output, request bodies, private worker URLs, and HMAC material were never included in screenshots, video, documentation, or repository output.
- Judges receive a new public single-history snapshot rather than the older integrated repository history.

## Submission media

- Final video: `submission/video/retryproof-demo-final.mp4`.
- Duration: **119.300 seconds (1:59.300)**, below the strict three-minute limit.
- Media: **1366×768 H.264 at 30 fps; 48 kHz mono AAC**.
- Normalized audio measured **-15.5 dB mean / -1.5 dB max**.
- SHA-256: `48cc6e7b8ff50fe001aac253a804457759b8367faa28f387d634f77287650753`.
- The cut uses production UI only and compresses only the live-worker wait. The narration discloses that compression.
- The submission package contains the six original 1366×768 walkthrough captures, the prior Proof Flight Recorder capture, and the current 1366×768 Black Box Replay/capsule production capture.

## Public judge artifacts

- Public judge snapshot: `https://github.com/marmar9615-cloud/RetryProof-Build-Week-2026`.
- Final judge-readable evidence package commit: `2b245758796096a960619dde1b51b35276f85307`.
- The snapshot is a clean, single-history judge package under the personal `marmar9615-cloud` account; anonymous raw-file access returned HTTP 200 and a redacted gitleaks scan found zero findings.
- The public package has no GitHub Actions workflow; focused frontend test/typecheck/build, API typecheck/build, exact integrated-source parity, artifact verification, and redacted secret scanning passed locally before the package commit. Its six database-backed API snapshot tests self-skipped because the standalone package has no test database.
- Public demo video: `https://youtu.be/4Oaie-WLKAc`.
- Anonymous YouTube page and oEmbed checks returned HTTP 200 with the expected title, MarMar Labs channel, and custom thumbnail.
- YouTube reported no copyright or Community Guidelines issues; English automatic captions are published.
- Majority-core Codex `/feedback` Session ID: `019f5e19-b54f-7862-8023-f0f4251a5a0f`.

## Devpost submission confirmation

- Project: `RetryProof` (`https://devpost.com/software/retryproof`).
- OpenAI Build Week submission ID: `1092862`.
- Status: **Submitted** at `2026-07-16T19:13:48.501-04:00`.
- The authenticated project state is `published` and lists OpenAI Build Week with the hosted judge URL.
- The official Devpost plugin refreshed the project to version 5 at `2026-07-20T20:36:20.388-04:00` and re-submitted the exact required Build Week answers. Readback confirmed the final description includes Black Box Replay, the reproducibility capsule, and the no-exactly-once/no-production-safety limitation; submission `1092862` remained **Submitted**.
- The public Devpost page returned HTTP 200 after submission.
