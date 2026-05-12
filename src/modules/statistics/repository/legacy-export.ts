/* eslint-disable max-lines, no-use-before-define, unicorn/no-null */
import type {
  LegacyOtherPlayersInput,
  LegacyPlayerReference,
  LegacyPlayerStatsInput,
  LegacyPublicStatsExportData,
  LegacyPublicStatsExportRepository,
  LegacyRotationStatsInput,
  LegacySquadStatsInput,
  LegacyWeaponsInput,
  LegacyWeekInput,
  LegacyWeeksInput,
} from "../export/legacy-public-export.js";
import type { Pool } from "pg";

interface SourceDatabaseRow {
  source_database: string;
}

interface PlayerStatRow {
  deaths_by_teamkills: string;
  deaths_total: string;
  id: string;
  kills: string;
  kills_from_vehicle: string;
  last_played_game_date: Date | null;
  last_squad_prefix: string | null;
  name: string;
  teamkills: string;
  total_played_games: string;
  vehicle_kills: string;
}

interface SquadStatRow {
  deaths_by_teamkills: string;
  deaths_total: string;
  id: string;
  kills: string;
  name: string;
  players: LegacyPlayerStatsInput[] | null;
  teamkills: string;
  total_played_games: string;
  total_players: string;
}

interface RotationStatRow {
  end_date: Date | null;
  id: string;
  name: string;
  players: LegacyPlayerStatsInput[] | null;
  squads: LegacySquadStatsInput[] | null;
  start_date: Date;
  total_games: string;
}

interface RelationshipRow {
  count: string;
  relationship_type: "killed" | "killers" | "teamkilled" | "teamkillers";
  source_player_id: string;
  source_player_name: string;
  target_player_id: string;
  target_player_name: string;
}

interface WeaponRow {
  kills: string;
  player_id: string;
  player_name: string;
  weapon_group: "firearms" | "vehicles";
  weapon_name: string;
}

interface WeekRow {
  deaths_by_teamkills: string;
  deaths_total: string;
  end_date: Date;
  kills: string;
  kills_from_vehicle: string;
  player_id: string;
  player_name: string;
  start_date: Date;
  teamkills: string;
  total_played_games: string;
  vehicle_kills: string;
  week: string;
}

export class PgLegacyPublicStatsExportRepository implements LegacyPublicStatsExportRepository {
  public constructor(private readonly pool: Pool) {}

  public async loadExportData(): Promise<LegacyPublicStatsExportData> {
    const [
      sourceDatabase,
      playerRows,
      squadRows,
      rotationRows,
      relationshipRows,
      weaponRows,
      weekRows,
    ] = await Promise.all([
      this.loadSourceDatabase(),
      this.loadPlayerStats(),
      this.loadSquadStats(),
      this.loadRotationStats(),
      this.loadRelationships(),
      this.loadWeapons(),
      this.loadWeeks(),
    ]);

    return {
      otherPlayers: mapRelationships(relationshipRows),
      playerGlobalStats: playerRows.map((row) => playerStats(row)),
      rotationStats: rotationRows.map((row) => rotationStats(row)),
      sourceDatabase,
      squadStats: squadRows.map((row) => squadStats(row)),
      weapons: mapWeapons(weaponRows),
      weeks: mapWeeks(weekRows),
    };
  }

  private async loadSourceDatabase(): Promise<string> {
    const result = await this.pool.query<SourceDatabaseRow>(
      "select current_database() as source_database",
    );
    return result.rows[0]?.source_database ?? "unknown";
  }

  private async loadPlayerStats(): Promise<PlayerStatRow[]> {
    const result = await this.pool.query<PlayerStatRow>(PLAYER_STATS_SQL);
    return result.rows;
  }

  private async loadSquadStats(): Promise<SquadStatRow[]> {
    const result = await this.pool.query<SquadStatRow>(SQUAD_STATS_SQL);
    return result.rows;
  }

  private async loadRotationStats(): Promise<RotationStatRow[]> {
    const result = await this.pool.query<RotationStatRow>(ROTATION_STATS_SQL);
    return result.rows;
  }

  private async loadRelationships(): Promise<RelationshipRow[]> {
    const result = await this.pool.query<RelationshipRow>(RELATIONSHIPS_SQL);
    return result.rows;
  }

  private async loadWeapons(): Promise<WeaponRow[]> {
    const result = await this.pool.query<WeaponRow>(WEAPONS_SQL);
    return result.rows;
  }

  private async loadWeeks(): Promise<WeekRow[]> {
    const result = await this.pool.query<WeekRow>(WEEKS_SQL);
    return result.rows;
  }
}

const PLAYER_ENTITY_CTE = `
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

const PLAYER_STATS_SQL = `
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
  coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills
from canonical_players player
left join player_stats stats on stats.player_id = player.id
left join counter_totals on counter_totals.player_id = player.id::text
left join last_games on last_games.player_id = player.id::text
left join latest_squads on latest_squads.player_id = player.id
group by player.id, player.display_name, latest_squads.last_squad_prefix,
  last_games.last_played_game_date, counter_totals.kills_from_vehicle,
  counter_totals.vehicle_kills
order by kills desc, player.display_name, player.id
`;

const SQUAD_STATS_SQL = `
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
      left join player_stats player_stat on player_stat.player_id = player.id
      where membership.squad_id = squad.id
      group by player.id, player.display_name
    ) squad_players
  ), '[]'::jsonb) as players
from squads squad
left join squad_stats stats on stats.squad_id = squad.id
group by squad.id, squad.name
order by kills desc, squad.name, squad.id
`;

const ROTATION_STATS_SQL = `
select
  rotation.id,
  rotation.name,
  rotation.starts_at as start_date,
  rotation.ends_at as end_date,
  count(distinct replay.id)::text as total_games,
  coalesce((
    select jsonb_agg(player_payload order by (player_payload->>'kills')::integer desc, player_payload->>'name')
    from (
      select jsonb_build_object(
        'id', player.id,
        'name', player.display_name,
        'lastSquadPrefix', null,
        'lastPlayedGameDate', null,
        'totalPlayedGames', coalesce((player_stat.stats->>'replay_count')::integer, 0),
        'kills', coalesce((player_stat.stats->>'kills')::integer, 0),
        'killsFromVehicle', 0,
        'vehicleKills', 0,
        'teamkills', coalesce((player_stat.stats->>'teamkills')::integer, 0),
        'deathsTotal', coalesce((player_stat.stats#>>'{deaths,total}')::integer, 0),
        'deathsByTeamkills', coalesce((player_stat.stats#>>'{deaths,by_teamkills}')::integer, 0)
      ) as player_payload
      from player_stats player_stat
      join canonical_players player on player.id = player_stat.player_id
      where player_stat.rotation_id = rotation.id
    ) rotation_players
  ), '[]'::jsonb) as players,
  coalesce((
    select jsonb_agg(squad_payload order by (squad_payload->>'kills')::integer desc, squad_payload->>'name')
    from (
      select jsonb_build_object(
        'id', rotation_squad.id,
        'name', rotation_squad.name,
        'totalPlayedGames', coalesce((squad_stat.stats->>'replay_count')::integer, 0),
        'kills', coalesce((squad_stat.stats->>'kills')::integer, 0),
        'teamkills', coalesce((squad_stat.stats->>'teamkills')::integer, 0),
        'deathsTotal', coalesce((squad_stat.stats#>>'{deaths,total}')::integer, 0),
        'deathsByTeamkills', coalesce((squad_stat.stats#>>'{deaths,by_teamkills}')::integer, 0),
        'totalPlayers', coalesce((squad_stat.stats->>'player_count')::integer, 0),
        'players', '[]'::jsonb
      ) as squad_payload
      from squad_stats squad_stat
      join squads rotation_squad on rotation_squad.id = squad_stat.squad_id
      where squad_stat.rotation_id = rotation.id
    ) rotation_squads
  ), '[]'::jsonb) as squads
from rotations rotation
left join replays replay on replay.rotation_id = rotation.id and replay.status = 'parsed'
group by rotation.id, rotation.name, rotation.starts_at, rotation.ends_at
order by rotation.starts_at, rotation.id
`;

const RELATIONSHIPS_SQL = `
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
where source_player_id is not null and target_player_id is not null
group by source_player_id, source_player_name, target_player_id, target_player_name, relationship_type
order by source_player_name, relationship_type, count desc, target_player_name
`;

const WEAPONS_SQL = `
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
  and event.observed_player_ref is not null
group by player_id, player_name, weapon_group, weapon_name
order by player_name, weapon_group, kills desc, weapon_name
`;

const WEEKS_SQL = `
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
  and replay.replay_timestamp is not null
group by player_id, player_name, week, start_date, end_date
order by player_name, week desc
`;

function playerStats(row: PlayerStatRow): LegacyPlayerStatsInput {
  return {
    deathsByTeamkills: numberFrom(row.deaths_by_teamkills),
    deathsTotal: numberFrom(row.deaths_total),
    id: row.id,
    kills: numberFrom(row.kills),
    killsFromVehicle: numberFrom(row.kills_from_vehicle),
    lastPlayedGameDate: dateIso(row.last_played_game_date),
    lastSquadPrefix: row.last_squad_prefix,
    name: row.name,
    teamkills: numberFrom(row.teamkills),
    totalPlayedGames: numberFrom(row.total_played_games),
    vehicleKills: numberFrom(row.vehicle_kills),
  };
}

function squadStats(row: SquadStatRow): LegacySquadStatsInput {
  return {
    deathsByTeamkills: numberFrom(row.deaths_by_teamkills),
    deathsTotal: numberFrom(row.deaths_total),
    id: row.id,
    kills: numberFrom(row.kills),
    name: row.name,
    players: row.players ?? [],
    teamkills: numberFrom(row.teamkills),
    totalPlayedGames: numberFrom(row.total_played_games),
    totalPlayers: numberFrom(row.total_players),
  };
}

function rotationStats(row: RotationStatRow): LegacyRotationStatsInput {
  return {
    endDate: dateIso(row.end_date),
    id: row.id,
    name: row.name,
    players: row.players ?? [],
    squads: row.squads ?? [],
    startDate: row.start_date.toISOString(),
    totalGames: numberFrom(row.total_games),
  };
}

function mapRelationships(rows: RelationshipRow[]): LegacyOtherPlayersInput[] {
  const byPlayer = new Map<string, LegacyOtherPlayersInput>();
  for (const row of rows) {
    const entry = getRelationshipEntry(byPlayer, {
      id: row.source_player_id,
      name: row.source_player_name,
    });
    entry[row.relationship_type].push({
      count: numberFrom(row.count),
      id: row.target_player_id,
      name: row.target_player_name,
    });
  }
  return [...byPlayer.values()];
}

function getRelationshipEntry(
  byPlayer: Map<string, LegacyOtherPlayersInput>,
  player: LegacyPlayerReference,
): LegacyOtherPlayersInput {
  const existing = byPlayer.get(player.id);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    killed: [],
    killers: [],
    player,
    teamkilled: [],
    teamkillers: [],
  };
  byPlayer.set(player.id, created);
  return created;
}

function mapWeapons(rows: WeaponRow[]): LegacyWeaponsInput[] {
  const byPlayer = new Map<string, LegacyWeaponsInput>();
  for (const row of rows) {
    const entry = getWeaponEntry(byPlayer, {
      id: row.player_id,
      name: row.player_name,
    });
    entry[row.weapon_group].push({
      kills: numberFrom(row.kills),
      name: row.weapon_name,
    });
  }
  return [...byPlayer.values()];
}

function getWeaponEntry(
  byPlayer: Map<string, LegacyWeaponsInput>,
  player: LegacyPlayerReference,
): LegacyWeaponsInput {
  const existing = byPlayer.get(player.id);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    firearms: [],
    player,
    vehicles: [],
  };
  byPlayer.set(player.id, created);
  return created;
}

function mapWeeks(rows: WeekRow[]): LegacyWeeksInput[] {
  const byPlayer = new Map<string, LegacyWeeksInput>();
  for (const row of rows) {
    const entry = getWeekEntry(byPlayer, {
      id: row.player_id,
      name: row.player_name,
    });
    entry.weeks.push(weekInput(row));
  }
  return [...byPlayer.values()];
}

function getWeekEntry(
  byPlayer: Map<string, LegacyWeeksInput>,
  player: LegacyPlayerReference,
): LegacyWeeksInput {
  const existing = byPlayer.get(player.id);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    player,
    weeks: [],
  };
  byPlayer.set(player.id, created);
  return created;
}

function weekInput(row: WeekRow): LegacyWeekInput {
  return {
    deathsByTeamkills: numberFrom(row.deaths_by_teamkills),
    deathsTotal: numberFrom(row.deaths_total),
    endDate: row.end_date.toISOString(),
    kills: numberFrom(row.kills),
    killsFromVehicle: numberFrom(row.kills_from_vehicle),
    startDate: row.start_date.toISOString(),
    teamkills: numberFrom(row.teamkills),
    totalPlayedGames: numberFrom(row.total_played_games),
    vehicleKills: numberFrom(row.vehicle_kills),
    week: row.week,
  };
}

function dateIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function numberFrom(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}
