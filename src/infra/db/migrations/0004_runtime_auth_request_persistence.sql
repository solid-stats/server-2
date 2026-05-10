create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_auth_sessions_user on auth_sessions(user_id);
create index idx_auth_sessions_expires on auth_sessions(expires_at);

alter table audit_patches
  add column request_id uuid references requests(id) on delete cascade,
  add column recalculation_status text not null default 'pending';

create index idx_audit_patches_request on audit_patches(request_id, created_at);

create table request_workflow_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  moderator_user_id uuid not null references users(id),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_request_workflow_actions_request on request_workflow_actions(request_id, created_at);
