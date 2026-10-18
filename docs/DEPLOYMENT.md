# Deployment guide

> This is the standalone Docker/Render reference deployment. The submitted product uses the integrated MarMarLabs Replit topology: public Autoscale app plus a separate private Reserved VM Codex worker. The current external state and safe worker-token rotation order are maintained in `submission/EXTERNAL-HANDOFF.md` and the installed `retryproof-replit-publish-guard` skill.

The judged demo should remain usable without a rebuild and should not depend on a live model call. Deploy cached mode first, then enable live mode only after the deterministic path and provenance labels are verified.

## Production requirements

- Node.js 20+
- PostgreSQL 15+
- HTTPS
- at least 512 MiB RAM for the web process
- OpenAI API key only if live analysis or repair is enabled
- a random session signing secret of at least 32 bytes

## Local production build

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run eval:golden
npm run demo:rehearse
npm run build
npm run start:production
```

Use a clean shell and do not print environment variables. Visit the application from an incognito window and complete the seeded red-to-green journey.

## Database

Set `DATABASE_URL`, then run the tracked migration command:

```bash
npm run db:migrate
```

The command expects an operator-provided `DATABASE_URL`; it does not create accounts or print secrets. It takes a PostgreSQL advisory lock, validates the SHA-256 of previously applied files, and records each migration in `retryproof_schema_migrations`. It is safe to run again: an unchanged schema produces an explicit no-op result. Migration `001_initial.sql` establishes sessions, jobs, per-session limits, audit, and normalized evidence tables. Migration `002_lab.sql` adds the short-lived API record store. Migration `003_global_rate_limits.sql` adds shared buckets for anonymous-session creation and live model budgets.

Schedule expiry cleanup with the deployment provider at least hourly:

```bash
npm run cleanup:expired
```

The command reports only deletion counts. Without `DATABASE_URL` it exits successfully with a clear skipped status because an in-memory store has no cross-process records.

## Secrets

Generate a signing secret locally without echoing it into source control:

```bash
openssl rand -base64 48
```

Paste the result directly into the deployment provider's secret manager as `SESSION_SIGNING_SECRET`. Configure `OPENAI_API_KEY` the same way. Never place either value in `render.yaml`, a Docker build argument, a screenshot, or a `NEXT_PUBLIC_` variable.

## Docker

Build and run cached mode:

```bash
docker build -t retryproof:local .
docker run --rm -p 3000:3000 \
  -e DEMO_MODEL_MODE=cached \
  -e CODEX_REPAIR_MODE=cached \
  -e SESSION_SIGNING_SECRET='replace-with-32-plus-random-bytes' \
  retryproof:local
```

For production, pass secrets through the platform secret store rather than the command line.

## Render blueprint

`render.yaml` defines:

- one Docker web service;
- one managed PostgreSQL database;
- cached model modes by default;
- generated signing secret;
- `DATABASE_URL` injected from the database.

The blueprint pins PostgreSQL 16, matching the container verification environment. As verified against Render's current official documentation on July 14, 2026, `free` remains a valid Blueprint plan for both the web service and PostgreSQL. The tradeoffs matter: a free web service spins down after 15 idle minutes and can take about a minute to wake, while a free PostgreSQL database expires 30 days after creation. That window covers judging and the August 12 winner announcement when deployment occurs during Build Week, but the URL must be preflighted before any judge-facing rehearsal. Use a paid instance only with the account owner's explicit purchase approval. See [Render free-instance limits](https://render.com/docs/free) and the [Blueprint specification](https://render.com/docs/blueprint-spec).

The production container runs `npm run db:migrate` before starting Next.js. Render checks `/api/v1/ready`, which returns `503` until PostgreSQL is reachable and all runtime schema dependencies are present. Deployment is an external state change and is intentionally not performed by repository scripts. Review the blueprint before connecting the repository in Render.

To enable live analysis after deployment:

1. add `OPENAI_API_KEY` as a secret and, when required, set `OPENAI_ORGANIZATION_ID` and `OPENAI_PROJECT_ID` as server-only values;
2. set `DEMO_MODEL_MODE=live`; live Codex repair is intentionally unavailable in production;
3. redeploy;
4. verify the UI and downloaded provenance say `live`;
5. restore cached mode if the live dependency is unstable.

For a trusted local Codex check only, set `CODEX_REPAIR_MODE=live` and `CODEX_ALLOW_LOCAL_LIVE=true` in a non-production process. RetryProof rejects live Codex repair in production until it can run in a separately isolated worker.

## Health and smoke checks

From an incognito browser:

1. the page loads without authentication;
2. safety disclosure is visible before upload;
3. **Try refund demo** loads synthetic data;
4. cached provenance is visible when configured;
5. the invariant cannot run before approval;
6. timeout-after-effect produces two mock refund effects before repair;
7. repair review shows the source hash and limitations;
8. identical rerun produces one mock effect;
9. evidence download contains no secret or real endpoint;
10. session deletion makes earlier artifacts unavailable.

Also verify security headers, HTTPS, cookie flags, database connectivity, cleanup, and structured logs without payload bodies.

The machine-readable readiness probe is:

```text
GET /api/v1/ready
```

It exposes only storage mode, schema state, and migration count. It never returns a connection string, database hostname, SQL error, or credential.

## Rollback

- Keep the previous successful image digest.
- Roll back the web image without changing the database schema.
- Disable live modes before treating an OpenAI outage as an application outage.
- Do not delete a database until required evidence has been exported and the retention policy permits deletion.
- If a secret may have leaked, revoke/rotate it before restoring service.

## Judge-access handoff

- public HTTPS URL works without login;
- cached demo works without OpenAI availability;
- repository README matches the deployed mode;
- video and screenshots contain only synthetic data;
- testing path is documented without needing to rebuild;
- no claim extends beyond supported deterministic semantics.
