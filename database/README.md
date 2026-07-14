# RetryProof database

The migrations are plain PostgreSQL SQL and are applied in filename order. The
application creates UUIDs, so the schema does not require a database extension.

Apply every migration in lexical order to an empty database:

```sh
for migration in database/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done
```

The job queue uses row locks with `FOR UPDATE SKIP LOCKED`. A running job whose
lock is older than the worker's configured stale threshold is eligible for a
new claim. Completed jobs are terminal and are never eligible. Session-scoped
data expires after 24 hours by application default; the cleanup command removes
expired sessions and independently expired queue/idempotency/rate-limit rows.
Global rate-limit buckets constrain anonymous session churn and shared live-model
budgets across session identities.

Only sanitized workflow graphs and fixtures belong in this database. Raw
uploads and secret values must never be inserted.
