/* eslint-disable max-lines */
export interface ParitySqlScope {
  scopeId: string;
}

/**
 * Restricts the global player/squad totals to a single all-time bucket
 * (`player_stats.rotation_id is null and game_type = $gameType`) instead of the
 * type-agnostic sum across every aggregate row. Required by the legacy export
 * since 01-03 added all-time (rotation_id NULL) rows alongside the per-rotation
 * rows — summing both double-counts. The public-stats hot path leaves this
 * undefined and keeps its existing type-agnostic projection byte-for-byte.
 */
export interface ParitySqlBucket {
  gameType: string;
}

export interface ParitySqlQuery {
  sql: string;
  values: string[];
}

export const PLAYER_ENTITY_CTE = `
player_entities as (
  select distinct on (counter.parser_result_id, counter.observed_player_ref)
    counter.parser_result_id,
    counter.observed_player_ref,
    coalesce(
      steam_player.id::text,
      nickname_player.id::text,
      display_player.id::text,
      nullif(counter.payload#>>'{player,name}', ''),
      counter.observed_player_ref
    ) as player_id,
    coalesce(
      steam_player.display_name,
      nickname_player.display_name,
      display_player.display_name,
      nullif(counter.payload#>>'{player,name}', ''),
      counter.observed_player_ref
    ) as player_name,
    replay.replay_timestamp
  from parser_events counter
  join parser_results result on result.id = counter.parser_result_id and result.status = 'current'
  join replays replay on replay.id = result.replay_id
  left join player_steam_ids steam on steam.steam_id = counter.payload#>>'{player,steam_id}'
  left join canonical_players steam_player on steam_player.id = steam.player_id
  left join player_nicknames nickname on lower(nickname.nickname) = lower(counter.payload#>>'{player,name}')
    and (
      replay.replay_timestamp is null
      or (
        (nickname.observed_from is null or nickname.observed_from <= replay.replay_timestamp)
        and (nickname.observed_to is null or nickname.observed_to >= replay.replay_timestamp)
      )
    )
  left join canonical_players nickname_player on nickname_player.id = nickname.player_id
  left join canonical_players display_player on lower(display_player.display_name) = lower(counter.payload#>>'{player,name}')
  where counter.event_type = 'player_counter'
  order by counter.parser_result_id, counter.observed_player_ref,
    case
      when steam_player.id is not null then 1
      when nickname_player.id is not null then 2
      when display_player.id is not null then 3
      else 4
    end,
    steam_player.id,
    nickname_player.id,
    display_player.id
)`;

function predicate(scope: ParitySqlScope | undefined, clause: string): string {
  return scope === undefined ? "" : `\n  ${clause}`;
}

function valuesFor(scope: ParitySqlScope | undefined): string[] {
  return scope === undefined ? [] : [scope.scopeId];
}

/**
 * Placeholder index for the game_type bucket predicate: `$2` when a scope
 * already occupies `$1`, otherwise `$1`. Keeps the unscoped legacy-export path
 * (no scope, bucket only) and the scoped public path numbering consistent.
 */
function bucketPlaceholder(scope: ParitySqlScope | undefined): string {
  return scope === undefined ? "$1" : "$2";
}

/**
 * Bucket filter appended to the `left join player_stats`/`squad_stats` ON
 * clause so the global totals read exactly one all-time bucket (rotation_id
 * NULL, one game_type) instead of summing per-rotation + all-time rows. Lives in
 * the join (not a WHERE) to preserve the LEFT JOIN: canonical players/squads
 * with no row in this bucket still appear with coalesced zeros, matching the
 * legacy global listing.
 */
function statsBucketJoinPredicate(
  bucket: ParitySqlBucket | undefined,
  scope: ParitySqlScope | undefined,
  alias: string,
): string {
  if (bucket === undefined) {
    return "";
  }
  return `\n  and ${alias}.rotation_id is null and ${alias}.game_type = ${bucketPlaceholder(scope)}`;
}

function bucketValues(
  scope: ParitySqlScope | undefined,
  bucket: ParitySqlBucket | undefined,
): string[] {
  const values = valuesFor(scope);
  if (bucket !== undefined) {
    values.push(bucket.gameType);
  }
  return values;
}

function isShowSelect(bucket: ParitySqlBucket | undefined): string {
  return bucket === undefined
    ? ""
    : ",\n  coalesce(bool_or(stats.is_show), true) as is_show";
}

export function playerStatsSql(
  scope?: ParitySqlScope,
  bucket?: ParitySqlBucket,
): ParitySqlQuery {
  return {
    sql: `
with ${PLAYER_ENTITY_CTE},
counter_totals as (
  select
    entity.player_id,
    coalesce(sum((event.payload->>'kills_from_vehicle')::integer), 0) as kills_from_vehicle,
    coalesce(sum((event.payload->>'vehicle_kills')::integer), 0) as vehicle_kills
  from parser_events event
  join parser_results result on result.id = event.parser_result_id and result.status = 'current'
  join replays replay on replay.id = result.replay_id
  join player_entities entity on entity.parser_result_id = event.parser_result_id
    and entity.observed_player_ref = event.observed_player_ref
  where event.event_type = 'player_counter'
  group by entity.player_id
),
last_games as (
  select
    entity.player_id,
    max(entity.replay_timestamp) as last_played_game_date
  from player_entities entity
  group by entity.player_id
),
latest_squads as (
  select distinct on (membership.player_id)
    membership.player_id,
    coalesce(squad.tag, squad.name) as last_squad_prefix
  from squad_memberships membership
  join squads squad on squad.id = membership.squad_id
  order by membership.player_id, membership.valid_from desc, membership.id
)
select
  player.id,
  player.display_name as name,
  latest_squads.last_squad_prefix,
  last_games.last_played_game_date,
  coalesce(sum((stats.stats->>'replay_count')::integer), 0) as total_played_games,
  coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
  coalesce(counter_totals.kills_from_vehicle, 0) as kills_from_vehicle,
  coalesce(counter_totals.vehicle_kills, 0) as vehicle_kills,
  coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
  coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
  coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills${isShowSelect(bucket)}
from canonical_players player
left join player_stats stats on stats.player_id = player.id${statsBucketJoinPredicate(bucket, scope, "stats")}
left join counter_totals on counter_totals.player_id = player.id::text
left join last_games on last_games.player_id = player.id::text
left join latest_squads on latest_squads.player_id = player.id${predicate(scope, "where player.id = $1::uuid")}
group by player.id, player.display_name, latest_squads.last_squad_prefix,
  last_games.last_played_game_date, counter_totals.kills_from_vehicle,
  counter_totals.vehicle_kills
order by kills desc, player.display_name, player.id
`,
    values: bucketValues(scope, bucket),
  };
}

export function squadStatsSql(
  scope?: ParitySqlScope,
  bucket?: ParitySqlBucket,
): ParitySqlQuery {
  return {
    sql: `
select
  squad.id,
  squad.name,
  coalesce(sum((stats.stats->>'replay_count')::integer), 0) as total_played_games,
  coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
  coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
  coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
  coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills,
  coalesce(sum((stats.stats->>'player_count')::integer), 0) as total_players,
  coalesce((
    select jsonb_agg(player_payload order by (player_payload->>'kills')::integer desc, player_payload->>'name')
    from (
      select jsonb_build_object(
        'id', player.id,
        'name', player.display_name,
        'lastSquadPrefix', coalesce(squad.tag, squad.name),
        'lastPlayedGameDate', null,
        'totalPlayedGames', coalesce(sum((player_stat.stats->>'replay_count')::integer), 0),
        'kills', coalesce(sum((player_stat.stats->>'kills')::integer), 0),
        'killsFromVehicle', 0,
        'vehicleKills', 0,
        'teamkills', coalesce(sum((player_stat.stats->>'teamkills')::integer), 0),
        'deathsTotal', coalesce(sum((player_stat.stats#>>'{deaths,total}')::integer), 0),
        'deathsByTeamkills', coalesce(sum((player_stat.stats#>>'{deaths,by_teamkills}')::integer), 0)
      ) as player_payload
      from squad_memberships membership
      join canonical_players player on player.id = membership.player_id
      left join player_stats player_stat on player_stat.player_id = player.id${statsBucketJoinPredicate(bucket, scope, "player_stat")}
      where membership.squad_id = squad.id
      group by player.id, player.display_name
    ) squad_players
  ), '[]'::jsonb) as players
from squads squad
left join squad_stats stats on stats.squad_id = squad.id${statsBucketJoinPredicate(bucket, scope, "stats")}${predicate(scope, "where squad.id = $1::uuid")}
group by squad.id, squad.name
order by kills desc, squad.name, squad.id
`,
    values: bucketValues(scope, bucket),
  };
}

export function relationshipsSql(scope?: ParitySqlScope): ParitySqlQuery {
  return {
    sql: `
with ${PLAYER_ENTITY_CTE},
kill_events as (
  select
    event.parser_result_id,
    replay.replay_timestamp,
    event.event_type,
    event.observed_player_ref as attacker_ref,
    event.payload->>'victim_entity_id' as victim_ref
  from parser_events event
  join parser_results result on result.id = event.parser_result_id and result.status = 'current'
  join replays replay on replay.id = result.replay_id
  where event.event_type in ('kill', 'teamkill')
),
resolved as (
  select
    attacker.player_id as attacker_id,
    attacker.player_name as attacker_name,
    victim.player_id as victim_id,
    victim.player_name as victim_name,
    event_type
  from kill_events
  join player_entities attacker on attacker.parser_result_id = kill_events.parser_result_id
    and attacker.observed_player_ref = kill_events.attacker_ref
  join player_entities victim on victim.parser_result_id = kill_events.parser_result_id
    and victim.observed_player_ref = kill_events.victim_ref
  where victim_ref is not null
),
pairs as (
  select attacker_id as source_player_id, attacker_name as source_player_name,
    victim_id as target_player_id, victim_name as target_player_name,
    case when event_type = 'teamkill' then 'teamkilled' else 'killed' end as relationship_type
  from resolved
  union all
  select victim_id as source_player_id, victim_name as source_player_name,
    attacker_id as target_player_id, attacker_name as target_player_name,
    case when event_type = 'teamkill' then 'teamkillers' else 'killers' end as relationship_type
  from resolved
)
select source_player_id, source_player_name, target_player_id, target_player_name,
  relationship_type, count(*)::text as count
from pairs
where source_player_id is not null and target_player_id is not null${predicate(scope, "and source_player_id = $1::text")}
group by source_player_id, source_player_name, target_player_id, target_player_name, relationship_type
order by source_player_name, relationship_type, count desc, target_player_name
`,
    values: valuesFor(scope),
  };
}

export function weaponsSql(scope?: ParitySqlScope): ParitySqlQuery {
  return {
    sql: `
with ${PLAYER_ENTITY_CTE}
select
  entity.player_id,
  entity.player_name,
  case when event.event_type = 'destroyed_vehicle' then 'vehicles' else 'firearms' end as weapon_group,
  coalesce(nullif(event.payload->>'weapon_name', ''), 'unknown') as weapon_name,
  count(*)::text as kills
from parser_events event
join parser_results result on result.id = event.parser_result_id and result.status = 'current'
join replays replay on replay.id = result.replay_id
join player_entities entity on entity.parser_result_id = event.parser_result_id
  and entity.observed_player_ref = event.observed_player_ref
where event.event_type in ('kill', 'teamkill', 'destroyed_vehicle')
  and event.observed_player_ref is not null${predicate(scope, "and entity.player_id = $1::text")}
group by player_id, player_name, weapon_group, weapon_name
order by player_name, weapon_group, kills desc, weapon_name
`,
    values: valuesFor(scope),
  };
}

export function weeksSql(scope?: ParitySqlScope): ParitySqlQuery {
  return {
    sql: `
with ${PLAYER_ENTITY_CTE}
select
  entity.player_id,
  entity.player_name,
  to_char(date_trunc('week', replay.replay_timestamp), 'IYYY-IW') as week,
  date_trunc('week', replay.replay_timestamp) as start_date,
  date_trunc('week', replay.replay_timestamp) + interval '6 days 23 hours 59 minutes 59.999 seconds' as end_date,
  count(distinct replay.id)::text as total_played_games,
  coalesce(sum((event.payload->>'kills')::integer), 0)::text as kills,
  coalesce(sum((event.payload->>'kills_from_vehicle')::integer), 0)::text as kills_from_vehicle,
  coalesce(sum((event.payload->>'vehicle_kills')::integer), 0)::text as vehicle_kills,
  coalesce(sum((event.payload->>'teamkills')::integer), 0)::text as teamkills,
  coalesce(sum((event.payload->>'deaths_total')::integer), 0)::text as deaths_total,
  coalesce(sum((event.payload->>'deaths_by_teamkills')::integer), 0)::text as deaths_by_teamkills
from parser_events event
join parser_results result on result.id = event.parser_result_id and result.status = 'current'
join replays replay on replay.id = result.replay_id
join player_entities entity on entity.parser_result_id = event.parser_result_id
  and entity.observed_player_ref = event.observed_player_ref
where event.event_type = 'player_counter'
  and replay.replay_timestamp is not null${predicate(scope, "and entity.player_id = $1::text")}
group by player_id, player_name, week, start_date, end_date
order by player_name, week desc
`,
    values: valuesFor(scope),
  };
}
