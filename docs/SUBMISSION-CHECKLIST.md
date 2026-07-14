# OpenAI Build Week submission checklist

Hard deadline: **July 21, 2026 at 5:00 PM PDT / 7:00 PM CDT**. Target submission: **5:00 PM CDT**, leaving two hours for access failures.

Do not check an item until the corresponding artifact or visible state exists.

## Eligibility and entry

- [ ] Entrant and every teammate satisfy age, geography, affiliation, and official-rules eligibility.
- [ ] RetryProof is entered in exactly one track: **Developer Tools**.
- [ ] New work is distinguishable through dated commits and Codex session history.
- [x] No disallowed third-party, customer, or credential data is included in the local candidate; the secret scanner passes with only four exact synthetic canaries.

## Working product

- [ ] Hosted HTTPS demo opens in incognito without login or rebuild.
- [x] Seeded refund journey works in the production Docker mode.
- [x] Import and compatibility disclosure are accurate.
- [x] Human approval is required before simulator execution.
- [x] Red timeout-after-effect trace shows two effects.
- [x] Repair provenance accurately says live Codex or cached template.
- [x] Identical rerun shows one effect and green invariant.
- [x] Artifact downloads work and contain source/trace/patch hashes.
- [x] Session deletion and expiry behave as documented.
- [x] Unsupported nodes are not approximated.
- [x] UI and evidence state that green is not exactly-once or production-safety proof.

## Verification

- [x] `npm ci`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run test:e2e`
- [x] `npm run eval:golden`
- [x] `npm run demo:rehearse`
- [x] `npm run build`
- [x] Ten consecutive UI rehearsals from a clean browser
- [x] Clean-package setup verified without `.env.local` or the private research plan
- [x] Repository secret scan reviewed
- [ ] Public URL, video, and repository checked in incognito

## Repository

- [ ] Public repository has the MIT license, or private repository is shared with `testing@devpost.com` and `build-week-event@openai.com`.
- [x] README has exact setup, sample data, supported platforms, and testing path.
- [x] README distinguishes cached and live GPT-5.6/Codex modes.
- [x] README describes where Codex accelerated implementation and key human decisions.
- [x] README and docs contain no unbuilt claims.
- [ ] `.env.local`, API keys, database URLs, and session secrets are absent from history.
- [x] Fixture and screenshot data are synthetic.
- [x] Direct runtime dependency licenses are permissive and `npm audit --omit=dev` reports zero vulnerabilities.

## Demo video

- [ ] Public YouTube video is strictly under three minutes.
- [x] Working product is visible; not a slide-only pitch.
- [x] Clear audio/voiceover and captions.
- [x] Both GPT-5.6 and Codex roles are explained.
- [x] Human approval and deterministic oracle are visible.
- [x] Central red-to-green comparison uses the same event, seed, scenario, and deliveries.
- [x] Cached provenance is visible if cached artifacts are used.
- [x] No unlicensed music, trademarks used as endorsement, private tabs, notifications, credentials, or customer data.
- [ ] Playback and public visibility verified in incognito.

## Devpost fields and assets

- [x] Title: **RetryProof**
- [x] Tagline: **Break your automation before retries do.**
- [x] Accurate short and long descriptions.
- [x] Technology list reflects actual implementation and deployed modes.
- [ ] Repository URL and hosted testing URL.
- [ ] Public YouTube URL.
- [ ] `/feedback` Codex Session ID containing the majority of core implementation.
- [x] Setup, supported platform, and no-rebuild judge instructions.
- [x] Screenshots: import, approved contract, red trace, repair diff, green matrix, evidence receipt.
- [x] Thumbnail shows `2 refund calls → 1`, not an unsupported safety claim.

## Final claim audit

- [x] “GPT-5.6 proposed” is not written as “GPT-5.6 proved.”
- [x] “Codex prepared a patch” is not written as “Codex safely deployed.”
- [x] “Simulator passed declared scenarios” is not written as “production is safe.”
- [x] Measured counts and performance claims match artifacts.
- [ ] No placeholder, planned, expected, or TODO text remains in submitted copy.
- [x] Every feature described is visible in the product or explicitly labeled future work.

## Submission proof

- [ ] Capture the completed Devpost confirmation state.
- [ ] Record final repository commit, deployment URL, video URL, and `/feedback` ID.
- [ ] Preserve exact submitted copy and asset filenames.
- [ ] Do not confuse a draft form with a submitted entry.
