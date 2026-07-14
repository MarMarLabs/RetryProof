# External submission handoff

Everything below changes external state. Do not perform it until the user explicitly approves the applicable action.

## Inputs still needed

1. Git commit author name and email. Do not infer an email from an application account because it may become public in repository history.
2. Repository visibility choice: public with the included MIT license, or private and shared with `testing@devpost.com` and `build-week-event@openai.com`.
3. Hosting approval and plan choice. The included Render Blueprint uses free web and PostgreSQL instances and makes no purchase. A free web service can cold-start after 15 idle minutes; a paid instance requires separate purchase approval.
4. Approval to upload `video/retryproof-demo-final.mp4` publicly to YouTube.
5. The real `/feedback` Codex Session ID containing the majority of core implementation.
6. Final eligibility/team confirmation from the entrant.

## Exact execution order

1. Configure the approved local Git author, stage the candidate, rerun the secret scan, and create the dated initial commit.
2. Create the approved repository, push the exact commit, and verify `.env.local` plus the private research plan are absent from the remote history.
3. Connect the repository to Render using `render.yaml`. Keep both agent modes cached for the no-rebuild judge path. Do not add the OpenAI key unless live mode is separately approved.
4. Wait for `GET /api/v1/ready` to return HTTP 200 with `ready=true`, `schema=ready`, and three migrations. Complete the full seeded path in an incognito browser, download the ZIP, delete the session, and repeat once after a cold start.
5. Upload the final MP4, captions, thumbnail, and `video/YOUTUBE.md` copy to YouTube. Set visibility to Public, then verify playback and captions in an incognito window. Do not regenerate the already-verified MP4 after upload.
6. Run `/feedback` in the majority-core Codex task and copy the returned Session ID exactly.
7. Replace only these placeholders:
   - `[DEPLOYED_HTTPS_URL]`
   - `https://github.com/marmar9615-cloud/RetryProof`
   - `[YOUTUBE_URL]`
   - `[FEEDBACK_SESSION_ID]`
8. Run the final placeholder, claim, secret, URL, and asset audit. Record the repository commit SHA and deployment image/version.
9. Populate Devpost from `submission/DEVPOST.md`, attach the six screenshots and thumbnail, and verify the under-three-minute public video is embedded.
10. Stop at the final Devpost confirmation control for the user unless the user separately authorizes submission. After submission, capture the confirmation page and preserve the exact submitted copy.

## Deadline controls

- Hard deadline: **July 21, 2026 at 5:00 PM PDT / 7:00 PM CDT**.
- Internal target: **July 21 at 5:00 PM CDT**, preserving two hours for access, video-processing, or cold-start failures.
- Keep the hosted demo alive through at least the published winner announcement on **August 12, 2026**.
