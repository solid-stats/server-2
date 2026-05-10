create type parse_job_history_action as enum (
  'created',
  'manual_reparse',
  'publish_failed',
  'published',
  'retried',
  'parser_completed',
  'parser_failed'
);

create table parse_job_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references parse_jobs(id) on delete cascade,
  action parse_job_history_action not null,
  status_from parse_job_status,
  status_to parse_job_status not null,
  actor_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_parse_job_history_job on parse_job_history(job_id, created_at);
