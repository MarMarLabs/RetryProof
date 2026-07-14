begin;

create table if not exists sessions (
  id uuid primary key,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  demo_seed boolean not null default false,
  constraint sessions_expiry_after_creation check (expires_at > created_at)
);

create table if not exists workflows (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  n8n_export_version text not null,
  sanitized_graph jsonb not null,
  sanitized_fixture jsonb not null,
  supported_nodes integer not null check (supported_nodes >= 0),
  total_nodes integer not null check (total_nodes >= 0),
  support_coverage numeric(5,4) not null check (support_coverage between 0 and 1),
  unsupported_nodes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  unique (session_id, source_sha256),
  constraint workflows_expiry_after_creation check (expires_at > created_at),
  constraint workflows_supported_not_over_total check (supported_nodes <= total_nodes),
  constraint workflows_graph_is_object check (jsonb_typeof(sanitized_graph) = 'object'),
  constraint workflows_fixture_is_object check (jsonb_typeof(sanitized_fixture) = 'object'),
  constraint workflows_unsupported_is_array check (jsonb_typeof(unsupported_nodes) = 'array')
);

create table if not exists analysis_runs (
  id uuid primary key,
  workflow_id uuid not null references workflows(id) on delete cascade,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  plan_version integer not null check (plan_version > 0),
  status text not null check (status in ('queued', 'running', 'draft', 'approved', 'failed')),
  model text,
  model_request_id text,
  risk_plan jsonb,
  prompt_version text not null,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  approved_at timestamptz,
  created_at timestamptz not null,
  unique (workflow_id, plan_version)
);

create table if not exists invariants (
  id uuid primary key,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  external_id text not null,
  statement text not null,
  oracle_type text not null,
  oracle_config jsonb not null,
  source_node_ids jsonb not null,
  approved boolean not null default false,
  unique (analysis_run_id, external_id),
  constraint invariants_node_ids_is_array check (jsonb_typeof(source_node_ids) = 'array')
);

create table if not exists scenarios (
  id uuid primary key,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  external_id text not null,
  scenario_type text not null,
  target_node_id text not null,
  fault_config jsonb not null,
  expected_invariant_ids jsonb not null,
  status text not null check (status in ('draft', 'approved', 'running', 'passed', 'failed')),
  unique (analysis_run_id, external_id),
  constraint scenarios_invariant_ids_is_array check (jsonb_typeof(expected_invariant_ids) = 'array')
);

create table if not exists executions (
  id uuid primary key,
  scenario_id uuid not null references scenarios(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  trace jsonb not null,
  verdict jsonb not null,
  duration_ms integer not null check (duration_ms >= 0),
  started_at timestamptz not null,
  unique (scenario_id, attempt)
);

create table if not exists artifacts (
  id uuid primary key,
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  kind text not null,
  content jsonb,
  content_text text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  generated_by text not null check (generated_by in ('codex', 'system', 'cached')),
  approved_at timestamptz,
  created_at timestamptz not null,
  constraint artifacts_one_content check (
    (content is not null and content_text is null)
    or (content is null and content_text is not null)
  )
);

create table if not exists jobs (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  job_type text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  payload jsonb not null,
  progress jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null,
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint jobs_expiry_after_creation check (expires_at > created_at),
  constraint jobs_lock_consistent check (
    (status = 'running' and locked_at is not null and locked_by is not null)
    or (status <> 'running' and locked_at is null and locked_by is null)
  ),
  constraint jobs_completion_consistent check (
    (status in ('completed', 'failed') and completed_at is not null)
    or (status in ('queued', 'running') and completed_at is null)
  )
);

create table if not exists idempotency_keys (
  session_id uuid not null references sessions(id) on delete cascade,
  route text not null,
  key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (session_id, route, key),
  constraint idempotency_expiry_after_creation check (expires_at > created_at),
  constraint idempotency_response_consistent check (
    response_status is not null or response_body is null
  )
);

create table if not exists audit_events (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  workflow_id uuid references workflows(id) on delete set null,
  event_type text not null,
  request_id text not null,
  metadata jsonb not null,
  created_at timestamptz not null,
  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists rate_limit_buckets (
  session_id uuid not null references sessions(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  count integer not null check (count > 0),
  expires_at timestamptz not null,
  primary key (session_id, action, window_start),
  constraint rate_bucket_expiry_after_window check (expires_at > window_start)
);

create index if not exists workflows_session_created_idx on workflows(session_id, created_at desc);
create index if not exists workflows_expires_idx on workflows(expires_at);
create index if not exists analysis_runs_workflow_created_idx on analysis_runs(workflow_id, created_at desc);
create index if not exists scenarios_analysis_status_idx on scenarios(analysis_run_id, status);
create index if not exists executions_scenario_started_idx on executions(scenario_id, started_at desc);
create index if not exists artifacts_analysis_kind_idx on artifacts(analysis_run_id, kind);
create index if not exists audit_events_session_created_idx on audit_events(session_id, created_at desc);
create index if not exists sessions_expires_idx on sessions(expires_at);
create index if not exists jobs_queued_available_idx on jobs(available_at, created_at)
  where status = 'queued';
create index if not exists jobs_running_locked_idx on jobs(locked_at)
  where status = 'running';
create index if not exists jobs_expires_idx on jobs(expires_at);
create index if not exists idempotency_expires_idx on idempotency_keys(expires_at);
create index if not exists rate_limit_buckets_expires_idx on rate_limit_buckets(expires_at);

commit;
