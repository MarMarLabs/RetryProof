begin;

create table if not exists lab_runtime_records (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  kind text not null check (
    kind in ('workflow', 'analysis', 'scenario_set', 'execution', 'repair', 'artifact')
  ),
  parent_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint lab_runtime_expiry_after_creation check (expires_at > created_at)
);

create index if not exists lab_runtime_session_kind_idx
  on lab_runtime_records(session_id, kind, created_at desc);
create index if not exists lab_runtime_parent_idx
  on lab_runtime_records(session_id, kind, parent_id, created_at);
create index if not exists lab_runtime_expires_idx
  on lab_runtime_records(expires_at);

commit;
