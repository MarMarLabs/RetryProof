# OpenAI Build Week submission checklist

Hard deadline: **July 21, 2026 at 5:00 PM PDT / 7:00 PM CDT**. Target submission: **5:00 PM CDT**, leaving two hours for access failures.

Do not check an item until the corresponding artifact or visible state exists.

## Eligibility and entry

- [ ] Entrant and every teammate satisfy age, geography, affiliation, and official-rules eligibility.
- [x] RetryProof is entered in exactly one track: **Developer Tools**.
- [ ] New work is distinguishable through dated commits and Codex session history.
- [x] No disallowed third-party, customer, or credential data is included in the local candidate; the secret scanner passes with only four exact synthetic canaries.

## Working product

- [x] Hosted HTTPS demo opens without login or rebuild; final incognito recheck remains part of the submission audit.
- [x] Seeded refund journey works in local production builds and the integrated MarMarLabs product tests.
- [x] Private Replit Codex worker is published, reachable only through a production External Access Token, and independently HMAC-authenticated.
- [x] Hosted **Repair with live Codex** completed with real signed progress events and fresh thread provenance; the final video take will repeat and record this proof.
- [x] Import and compatibility disclosure are accurate.
- [x] Human approval is required before simulator execution.
- [x] Red timeout-after-effect trace shows two effects.
- [x] Repair provenance accurately distinguishes live Codex from the validated fallback.
- [x] Identical rerun shows one effect and green invariant.
- [x] Artifact downloads work and contain source/trace/patch hashes.
- [x] Final-release Black Box Replay shows the first actual divergence in accepted before/after trace data.
- [x] Final-release reproducibility capsule contains the approved contract, paired traces, bounded repair, exact canonical receipt, limitations, and a deterministic path-sorted per-file SHA-256 manifest.
- [x] Session deletion and expiry behave as documented.
- [x] Unsupported nodes are not approximated.
- [x] UI and evidence state that green is not exactly-once or production-safety proof.

## Verification

- [x] `npm ci`
- [x] `npm run lint` after the final submission-package edits.
- [x] `npm run typecheck`
- [x] `npm test` after the final submission-package edits: 121/121 passed.
- [x] `npm run test:e2e`
- [x] `npm run eval:golden`
- [x] `npm run demo:rehearse`
- [x] `npm run build`
- [x] Ten consecutive UI rehearsals from a clean browser
- [x] Clean-package setup verified without `.env.local` or the private research plan
- [x] Repository secret scan reviewed
- [x] Public URL, video, and repository checked anonymously

## Repository

- [x] Public judge snapshot `marmar9615-cloud/RetryProof-Build-Week-2026` is anonymously accessible; submitted snapshot commit is recorded in `submission/VERIFICATION.md`.
- [x] Integrated repository README has exact setup, worker package, configuration names, sample path, and testing commands.
- [x] Integrated repository README distinguishes live GPT-5.6, live Codex, and labeled fallback behavior.
- [x] README describes where Codex accelerated implementation and key human decisions.
- [x] README and submission docs distinguish the standalone reference package from the deployed integrated product and contain no bracketed external placeholders.
- [ ] `.env.local`, API keys, database URLs, and session secrets are absent from history.
- [x] Fixture and screenshot data are synthetic.
- [x] Direct runtime dependency licenses are permissive and `npm audit --omit=dev` reports zero vulnerabilities.

## Demo video

- [x] Final public YouTube video is strictly under three minutes and was recorded after production live-worker acceptance.
- [x] Working product is visible; not a slide-only pitch.
- [x] Final recording has clear audio/voiceover; English automatic captions are published and the matching source captions remain in the submission package.
- [x] Both GPT-5.6 and Codex roles are explained.
- [x] Human approval and deterministic oracle are visible.
- [x] Central red-to-green comparison uses the same event, seed, scenario, and deliveries.
- [x] Fresh Codex provenance and the real progress feed are visible; the worker wait is explicitly disclosed as time-compressed.
- [x] No unlicensed music, trademarks used as endorsement, private tabs, notifications, credentials, or customer data.
- [x] Public playback and metadata verified anonymously at `https://youtu.be/4Oaie-WLKAc`.

## Devpost fields and assets

- [x] Title: **RetryProof**
- [x] Tagline: **Break your automation before retries do.**
- [x] Accurate short and long descriptions.
- [x] Technology list reflects the implemented public API, private worker, model boundaries, and deterministic validator.
- [x] Repository URL and hosted testing URL.
- [x] Public YouTube URL.
- [x] `/feedback` Codex Session ID containing the majority of core implementation.
- [x] Setup, supported platform, and no-rebuild judge instructions.
- [x] Production screenshots: import, approved contract, red trace, live repair, green matrix, canonical receipt, Proof Flight Recorder, and Black Box Replay.
- [x] Thumbnail shows `2 refund calls → 1`, not an unsupported safety claim.

## Final claim audit

- [x] “GPT-5.6 proposed” is not written as “GPT-5.6 proved.”
- [x] “Codex prepared a patch” is not written as “Codex safely deployed.”
- [x] “Simulator passed declared scenarios” is not written as “production is safe.”
- [x] The capsule manifest is described as a byte-consistency aid, not signer authentication, exactly-once proof, tamper-proofing, or production certification.
- [x] Measured counts and performance claims match artifacts.
- [x] No bracketed external placeholders remain in submitted copy; the final audit resolves all four required external fields.
- [x] Every feature described is visible in the product or explicitly labeled future work.

## Submission proof

- [x] Captured the completed Devpost confirmation state: submission `1092862`, status **Submitted**.
- [x] Recorded final repository commit, deployment URL, video URL, and `/feedback` ID.
- [x] Preserved exact submitted copy and asset filenames.
- [x] Verified the project state is `published`, is attached to OpenAI Build Week, and the public Devpost page returns HTTP 200.
