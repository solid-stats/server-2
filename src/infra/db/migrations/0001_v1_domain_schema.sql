create extension if not exists pgcrypto;

create type ingest_status as enum ('pending', 'promoted', 'conflicted', 'failed', 'ignored');
create type replay_status as enum ('staged', 'ready_for_parse', 'parsed', 'parse_failed', 'archived');
create type parse_job_status as enum ('queued', 'published', 'running', 'succeeded', 'failed', 'retryable');
create type parser_result_status as enum ('current', 'superseded', 'failed');
create type request_status as enum ('submitted', 'in_review', 'approved', 'rejected', 'cancelled');
create type moderation_action_type as enum ('approve', 'reject', 'comment', 'request_changes', 'apply_patch');

create table users (
  id uuid primary key default gen_random_uuid(),
  steam_id text unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role_id, granted_at)
);

create table canonical_players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table player_nicknames (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references canonical_players(id) on delete cascade,
  nickname text not null,
  observed_from timestamptz,
  observed_to timestamptz,
  source_replay_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, nickname, observed_from)
);

create index idx_player_nicknames_player on player_nicknames(player_id);
create index idx_player_nicknames_nickname on player_nicknames(lower(nickname));

create table player_steam_ids (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references canonical_players(id) on delete cascade,
  steam_id text not null,
  observed_from timestamptz,
  observed_to timestamptz,
  source text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, steam_id, observed_from)
);

create index idx_player_steam_ids_player on player_steam_ids(player_id);
create index idx_player_steam_ids_steam_id on player_steam_ids(steam_id);

create table squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table squad_memberships (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references squads(id) on delete cascade,
  player_id uuid not null references canonical_players(id) on delete cascade,
  valid_from timestamptz not null,
  valid_to timestamptz,
  source_replay_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index idx_squad_memberships_squad on squad_memberships(squad_id, valid_from);
create index idx_squad_memberships_player on squad_memberships(player_id, valid_from);

create table rotations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table ingest_staging_records (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_replay_id text not null,
  object_key text not null,
  checksum text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  replay_timestamp timestamptz,
  status ingest_status not null default 'pending',
  promotion_evidence jsonb not null default '{}'::jsonb,
  conflict_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_replay_id),
  unique (checksum, object_key)
);

create index idx_ingest_staging_status on ingest_staging_records(status, created_at);

create table replays (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_replay_id text not null,
  object_key text not null,
  checksum text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  replay_timestamp timestamptz,
  rotation_id uuid references rotations(id),
  status replay_status not null default 'ready_for_parse',
  promotion_evidence jsonb not null default '{}'::jsonb,
  promoted_from_staging_id uuid references ingest_staging_records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_replay_id),
  unique (checksum)
);

alter table player_nicknames
  add constraint fk_player_nicknames_source_replay
  foreign key (source_replay_id) references replays(id);

alter table squad_memberships
  add constraint fk_squad_memberships_source_replay
  foreign key (source_replay_id) references replays(id);

create index idx_replays_rotation_timestamp on replays(rotation_id, replay_timestamp);
create index idx_replays_status on replays(status, created_at);

create table parse_jobs (
  id uuid primary key default gen_random_uuid(),
  replay_id uuid not null references replays(id) on delete cascade,
  parser_contract_version text not null,
  object_key text not null,
  checksum text not null,
  status parse_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  published_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_parse_jobs_status on parse_jobs(status, created_at);
create index idx_parse_jobs_replay on parse_jobs(replay_id);

create table parser_results (
  id uuid primary key default gen_random_uuid(),
  replay_id uuid not null references replays(id) on delete cascade,
  parse_job_id uuid references parse_jobs(id),
  parser_contract_version text not null,
  status parser_result_status not null default 'current',
  raw_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_parser_results_replay_status on parser_results(replay_id, status);

create table parser_events (
  id uuid primary key default gen_random_uuid(),
  parser_result_id uuid not null references parser_results(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz,
  observed_player_ref text,
  payload jsonb not null,
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_parser_events_result_type on parser_events(parser_result_id, event_type);

create table player_stats (
  id uuid primary key default gen_random_uuid(),
  rotation_id uuid not null references rotations(id) on delete cascade,
  player_id uuid not null references canonical_players(id) on delete cascade,
  stats jsonb not null,
  calculated_at timestamptz not null default now(),
  unique (rotation_id, player_id)
);

create table squad_stats (
  id uuid primary key default gen_random_uuid(),
  rotation_id uuid not null references rotations(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete cascade,
  stats jsonb not null,
  calculated_at timestamptz not null default now(),
  unique (rotation_id, squad_id)
);

create table commander_side_stats (
  id uuid primary key default gen_random_uuid(),
  rotation_id uuid not null references rotations(id) on delete cascade,
  player_id uuid references canonical_players(id) on delete set null,
  side text not null,
  known_wins integer not null default 0 check (known_wins >= 0),
  known_losses integer not null default 0 check (known_losses >= 0),
  unknown_outcomes integer not null default 0 check (unknown_outcomes >= 0),
  calculated_at timestamptz not null default now()
);

create table bounty_points (
  id uuid primary key default gen_random_uuid(),
  rotation_id uuid not null references rotations(id) on delete cascade,
  player_id uuid not null references canonical_players(id) on delete cascade,
  points numeric(12, 2) not null default 0,
  inputs jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (rotation_id, player_id)
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references users(id),
  request_type text not null,
  status request_status not null default 'submitted',
  description text not null,
  referenced_entity_type text,
  referenced_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_requests_status on requests(status, created_at);
create index idx_requests_requester on requests(requester_user_id, created_at);

create table request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  object_key text not null,
  checksum text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  moderator_user_id uuid not null references users(id),
  action_type moderation_action_type not null,
  comment text,
  decision_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_moderation_actions_request on moderation_actions(request_id, created_at);

create table audit_patches (
  id uuid primary key default gen_random_uuid(),
  moderation_action_id uuid not null references moderation_actions(id) on delete restrict,
  affected_entity_type text not null,
  affected_entity_id uuid,
  patch jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_audit_patches_entity on audit_patches(affected_entity_type, affected_entity_id);
