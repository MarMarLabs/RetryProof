begin;

create table if not exists global_rate_limit_buckets (
  scope text not null,
  window_start timestamptz not null,
  count integer not null check (count > 0),
  expires_at timestamptz not null,
  primary key (scope, window_start),
  constraint global_rate_bucket_expiry_after_window check (expires_at > window_start)
);

create index if not exists global_rate_limit_buckets_expires_idx
  on global_rate_limit_buckets(expires_at);

commit;
