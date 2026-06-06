/* eslint-disable max-lines, no-use-before-define, unicorn/no-null */
import {
  playerStatsSql,
  relationshipsSql,
  squadStatsSql,
  weaponsSql,
  weeksSql,
} from "./parity-sql.js";

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

const PLAYER_STATS_SQL = playerStatsSql().sql;

const SQUAD_STATS_SQL = squadStatsSql().sql;

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

const RELATIONSHIPS_SQL = relationshipsSql().sql;

const WEAPONS_SQL = weaponsSql().sql;

const WEEKS_SQL = weeksSql().sql;

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
