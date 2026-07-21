# Submission asset checklist

## Required production screenshot set

- [x] `screenshots/01-import.png` shows the deployed sanitized five-node demo, `5/5` support coverage, and source binding.
- [x] `screenshots/02-contract.png` shows the deployed approval gate, exact effect/key/oracle, and seeded-contract provenance.
- [x] `screenshots/03-red-counterexample.png` shows the deployed four-scenario result and primary timeout trace: same event, two deliveries, two effects, fail.
- [x] `screenshots/04-codex-repair.png` shows the deployed accepted **Fresh Codex** artifact, validator checks, and truncated thread provenance.
- [x] `screenshots/05-green-comparison.png` shows the deployed before `2/fail` and after `1/pass` comparison using the identical suite.
- [x] `screenshots/06-evidence-receipt.png` shows the deployed hash, limitations, and **Download evidence ZIP** control.
- [x] `screenshots/07-proof-flight-recorder.png` preserves the prior production Proof Flight Recorder release for comparison.
- [x] `screenshots/08-black-box-replay-production.png` is the July 20 clean production capture of the live `2 → 1` result, reproducibility-capsule control, accepted before/after paths, and data-derived Black Box Replay.

Screenshots 01–07 preserve the earlier verified production path. Screenshot 08 is the current judge-readable evidence release and is bound to the fresh production receipt recorded in `submission/VERIFICATION.md`.

## July 20 final-release refresh

- [x] Capture **Black Box Replay** showing the first actual before/after trace divergence from accepted production traces.
- [x] Capture the **Download reproducibility capsule** control and verify the downloaded archive contains the approved contract, paired traces, bounded repair, exact canonical receipt, limitations, and deterministic per-file SHA-256 manifest.
- [x] Keep the manifest limitation legible: it verifies byte consistency only and does not establish signer identity, exactly-once execution, or production safety.
- [x] Recheck the final evidence view from a clean anonymous production session after the guarded public-app publish.
- [x] Preserve the exact production receipt and capsule under `submission/evidence/` for offline judge inspection.

## Image rules

- 16:9 or a consistent wide crop; minimum 1280×720.
- No unrelated tabs, email address, account avatar, API-key page, notification, terminal, or private URL.
- Synthetic values only.
- Cached/live provenance visible wherever an agent artifact is shown.
- Keep the “not exactly-once or production safety” boundary visible in the green/evidence images.

## Thumbnail

- [x] `thumbnail/retryproof-thumbnail.png`
- Main copy: `ONE RETRY. TWO REFUNDS.`
- Proof copy: `2 effects → 1`
- Footer: `GPT-5.6 proposes · Codex repairs · deterministic proof`
- No OpenAI or n8n logo treatment that implies endorsement.

## Video package

- [x] Final production cut `video/retryproof-demo-final.mp4` is 1:59.300 and strictly under 3:00.
- [x] The final visibly shows the red trace, live repair action, fresh Codex acceptance, identical green replay, and receipt.
- [x] `video/transcript.md` and `video/captions.srt` match the final production recording.
- [x] `video/YOUTUBE.md`.
- [x] Final audio level, caption timing, codecs, resolution, and duration were re-verified after replacement.
- [x] Public YouTube playback verified anonymously at `https://youtu.be/4Oaie-WLKAc`; oEmbed identifies the expected title and MarMar Labs channel.

The verified video and URL remain the submission baseline. Do not replace `https://youtu.be/4Oaie-WLKAc` unless a new cut is uploaded and independently rechecked for duration, playback, captions, claims, and privacy.

## External placeholders still requiring real values

- [x] Hosted HTTPS URL: `https://marmarlabs.com/retryproof/lab/`.
- [x] Public judge repository: `https://github.com/marmar9615-cloud/RetryProof-Build-Week-2026`.
- [x] Public YouTube URL: `https://youtu.be/4Oaie-WLKAc`.
- [x] `/feedback` Codex Session ID: `019f5e19-b54f-7862-8023-f0f4251a5a0f`.
