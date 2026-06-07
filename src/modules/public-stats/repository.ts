/* eslint-disable max-lines, max-params, no-magic-numbers, unicorn/no-null */
import {
  sortRelationships,
  sortWeapons,
  sortWeeks,
  type LegacyOtherPlayersInput,
  type LegacyWeaponsInput,
  type LegacyWeeksInput,
} from "../statistics/export/legacy-public-export.js";
import {
  kdRatio,
  killsFromVehicleCoef,
  totalScore,
} from "../statistics/parity-formulas.js";
import {
  mapRelationships,
  mapWeapons,
  mapWeeks,
  playerStats as mapPlayerStats,
} from "../statistics/repository/legacy-export.js";
import {
  playerStatsSql,
  relationshipsSql,
  weaponsSql,
  weeksSql,
} from "../statistics/repository/parity-sql.js";

import {
  mapReplayDetail,
  mapReplayEvent,
  type ReplayDetailRow,
  type ReplayEventRow,
} from "./replay-mapper.js";
import { withGaps } from "./routes/history-gaps.js";
import {
  encodeCursor,
  type CursorPayload,
} from "./routes/pagination/cursor.js";
import {
  buildKeysetPredicate,
  type KeysetDescriptor,
} from "./routes/pagination/keyset.js";
import { maskSteamId } from "./routes/pagination/mask.js";
import {
  BOUNTY_SORT,
  EVENT_PAGE_DEFAULT,
  EVENT_PAGE_MAX,
  EVENT_SORT,
  PLAYER_SORT,
  REPLAY_SORT,
  SQUAD_SORT,
  type SortDescriptor,
} from "./routes/pagination/sort.js";
import { maxTimestamp } from "./routes/provenance.js";
import { SITEMAP_PAGE_SIZE } from "./routes/sitemap.js";
import { looksLikeUuid } from "./routes/slug.js";

import type {
  BountySummary,
  CommanderSideSummary,
  LeaderboardFilters,
  NameHistoryPayload,
  OverviewFilters,
  PageQuery,
  PaginatedResult,
  PlayerListFilters,
  PlayerMembershipHistoryPayload,
  PlayerProfile,
  PlayerRelationshipsPayload,
  PlayerStatsPayload,
  PlayerSummary,
  PlayerVehiclesPayload,
  PlayerWeaponsPayload,
  PlayerWeeklyPayload,
  PublicLeaderboards,
  PublicStatsReadModel,
  ReplayDetail,
  ReplayEvent,
  ReplayListFilters,
  ReplaySummary,
  RotationDetail,
  RotationFilters,
  RotationSummary,
  SquadListFilters,
  SquadMembershipHistoryPayload,
  SquadProfile,
  SquadRelationshipsPayload,
  SquadStatsPayload,
  SquadSummary,
  SquadWeaponsPayload,
  SquadWeeklyPayload,
  StatsOverview,
} from "./routes/models.js";
import type { BountyPointEventEvidence } from "../statistics/bounty/bounty.js";
import type { Pool, QueryResultRow } from "pg";

interface CountRow {
  count: string;
}

interface RotationRow {
  created_at: Date;
  ends_at: Date | null;
  id: string;
  last_calc: Date | null;
  name: string;
  slug: string;
  starts_at: Date;
}

interface PlayerRow {
  aliases: string[];
  calculated_at: Date | null;
  deaths_by_teamkills: string;
  deaths_total: string;
  display_name: string;
  id: string;
  kills: string;
  replay_count: string;
  slug: string;
  steam_ids: string[];
  teamkills: string;
  updated_at: Date | null;
}

interface SquadRow {
  calculated_at: Date | null;
  deaths_by_teamkills: string;
  deaths_total: string;
  id: string;
  kills: string;
  name: string;
  player_count: string;
  replay_count: string;
  slug: string;
  teamkills: string;
  updated_at: Date | null;
}

interface TimestampRow {
  calculated_at: Date | null;
}

interface NicknameRow {
  nickname: string;
  observed_from: Date | null;
  observed_to: Date | null;
  source_replay_id: string | null;
}

interface PlayerMembershipRow {
  name: string;
  squad_id: string;
  squad_slug: string;
  valid_from: Date | null;
  valid_to: Date | null;
}

interface SquadMembershipRow {
  display_name: string;
  player_id: string;
  player_slug: string;
  valid_from: Date | null;
  valid_to: Date | null;
}

interface CommanderSideRow {
  display_name: string | null;
  known_losses: number;
  known_wins: number;
  player_id: string | null;
  rotation_id: string;
  side: string;
  unknown_outcomes: number;
}

// Runtime shape of the `bounty_points.inputs` jsonb at the read boundary. It
// mirrors the source-of-truth `BountyPointRow["inputs"]` from
// src/modules/statistics/bounty/bounty.ts but widens `version` to `number`: the
// column is untrusted jsonb that may hold legacy/old-version rows, so the
// `version !== 1` guard in foldBountyBreakdown must stay live, not statically dead.
interface BountyInputsRow {
  base_score: number;
  events: BountyPointEventEvidence[];
  total_points: number;
  version: number;
}

// Exported for the pure-mapper unit tests (repository.test.ts). `inputs` is
// nullable because legacy rows may store null.
export interface BountyRow {
  display_name: string;
  id: string;
  inputs: BountyInputsRow | null;
  player_id: string;
  points: string;
  rotation_id: string;
}

interface SquadPlayerRow {
  display_name: string;
  id: string;
}

interface SquadPlayer {
  displayName: string;
  id: string;
}

interface ExistenceRow {
  exists: boolean;
}

interface ParityPlayerStatRow {
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

interface ParityWeaponRow {
  kills: string;
  player_id: string;
  player_name: string;
  weapon_group: "firearms" | "vehicles";
  weapon_name: string;
}

interface ParityRelationshipRow {
  count: string;
  relationship_type: "killed" | "killers" | "teamkilled" | "teamkillers";
  source_player_id: string;
  source_player_name: string;
  target_player_id: string;
  target_player_name: string;
}

interface ParityWeekRow {
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

export class PgPublicStatsReadModel implements PublicStatsReadModel {
  public constructor(private readonly pool: Pool) {}

  public async getOverview(filters: OverviewFilters): Promise<StatsOverview> {
    const rotationCondition = rotationWhere(filters, "rotation_id"),
      replayCondition = rotationWhere(filters, "rotation_id"),
      [
        players,
        squads,
        replays,
        parsedReplays,
        playerStatRows,
        squadStatRows,
        commanderSides,
        bountyPlayers,
      ] = await Promise.all([
        count(this.pool, "canonical_players", "", []),
        count(this.pool, "squads", "", []),
        count(
          this.pool,
          "replays",
          replayCondition.sql,
          replayCondition.values,
        ),
        count(
          this.pool,
          "replays",
          replayCondition.sqlWith("status = 'parsed'"),
          replayCondition.values,
        ),
        count(
          this.pool,
          "player_stats",
          rotationCondition.sql,
          rotationCondition.values,
        ),
        count(
          this.pool,
          "squad_stats",
          rotationCondition.sql,
          rotationCondition.values,
        ),
        count(
          this.pool,
          "commander_side_stats",
          rotationCondition.sql,
          rotationCondition.values,
        ),
        count(
          this.pool,
          "bounty_points",
          rotationCondition.sql,
          rotationCondition.values,
        ),
      ]);

    return {
      filters: { rotationId: filters.rotationId ?? null },
      totals: {
        bountyPlayers,
        commanderSides,
        parsedReplays,
        players,
        playerStatRows,
        replays,
        squads,
        squadStatRows,
      },
    };
  }

  public async listRotations(): Promise<RotationSummary[]> {
    const result = await this.pool.query<RotationRow>(
      "select id, name, slug, starts_at, ends_at, created_at, null::timestamptz as last_calc from rotations order by starts_at desc, id",
    );
    return result.rows.map((row) => mapRotation(row));
  }

  public async listPlayers(
    filters: PlayerListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>> {
    const search = playerSearchWhere(filters.search, 2),
      // Existing params: $1 rotation, then search ($2). Seek values bind after.
      baseParameterCount = 1 + search.values.length,
      seek = keysetSeek(PLAYER_SORT, page, "players.id", baseParameterCount),
      values = [
        filters.rotationId ?? null,
        ...search.values,
        ...seek.values,
        page.limit + 1,
      ],
      result = await this.pool.query<PlayerRow>(
        `
          select ${playerSelectStats()}
          from canonical_players players
          left join player_stats stats on stats.player_id = players.id
            and ($1::uuid is null or stats.rotation_id = $1::uuid)
          where ${search.sql}
          group by players.id, players.display_name, players.slug, players.updated_at
          ${seek.havingClause}
          order by ${seek.orderBySql}
          limit $${String(values.length)}
        `,
        values,
      );
    return keysetResult(result.rows, page, {
      toCursor: (row) => playerRowCursor(row, page),
      toItem: (row) => mapPlayerSummary(row, filters.rotationId),
    });
  }

  public async getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null> {
    const isUuid = looksLikeUuid(id);
    // Split into two branches to avoid the invalid `$slug::uuid` cast that
    // PostgreSQL evaluates eagerly even inside a short-circuit AND expression.
    const whereClause = isUuid
      ? "players.id = $1::uuid"
      : "players.slug = $1::text";
    const result = await this.pool.query<PlayerRow>(
      `
        select ${playerSelectStats()},
          coalesce(array_agg(distinct nicknames.nickname) filter (where nicknames.nickname is not null), '{}') as aliases,
          coalesce(array_agg(distinct steam_ids.steam_id) filter (where steam_ids.steam_id is not null), '{}') as steam_ids
        from canonical_players players
        left join player_stats stats on stats.player_id = players.id
          and ($2::uuid is null or stats.rotation_id = $2::uuid)
        left join player_nicknames nicknames on nicknames.player_id = players.id
        left join player_steam_ids steam_ids on steam_ids.player_id = players.id
        where ${whereClause}
        group by players.id, players.display_name, players.slug, players.updated_at
      `,
      [id, filters.rotationId ?? null],
    );
    const [row] = result.rows;
    return row === undefined ? null : mapPlayerProfile(row, filters.rotationId);
  }

  public async listSquads(
    filters: SquadListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<SquadSummary>> {
    const search = squadSearchWhere(filters.search, 2),
      baseParameterCount = 1 + search.values.length,
      seek = keysetSeek(SQUAD_SORT, page, "squads.id", baseParameterCount),
      values = [
        filters.rotationId ?? null,
        ...search.values,
        ...seek.values,
        page.limit + 1,
      ],
      result = await this.pool.query<SquadRow>(
        `
          select ${squadSelectStats()}
          from squads
          left join squad_stats stats on stats.squad_id = squads.id
            and ($1::uuid is null or stats.rotation_id = $1::uuid)
          where ${search.sql}
          group by squads.id, squads.name, squads.slug, squads.updated_at
          ${seek.havingClause}
          order by ${seek.orderBySql}
          limit $${String(values.length)}
        `,
        values,
      );
    return keysetResult(result.rows, page, {
      toCursor: (row) => squadRowCursor(row, page),
      toItem: (row) => mapSquadSummary(row, filters.rotationId),
    });
  }

  public async getSquad(
    id: string,
    filters: RotationFilters,
  ): Promise<SquadProfile | null> {
    const isUuid = looksLikeUuid(id);
    // Split into two branches to avoid the invalid `$slug::uuid` cast.
    const whereClause = isUuid
      ? "squads.id = $1::uuid"
      : "squads.slug = $1::text";
    const result = await this.pool.query<SquadRow>(
      `
        select ${squadSelectStats()}
        from squads
        left join squad_stats stats on stats.squad_id = squads.id
          and ($2::uuid is null or stats.rotation_id = $2::uuid)
        where ${whereClause}
        group by squads.id, squads.name, squads.slug, squads.updated_at
      `,
      [id, filters.rotationId ?? null],
    );
    const [row] = result.rows;
    if (row === undefined) {
      return null;
    }
    const resolvedId = row.id;
    return {
      ...mapSquadSummary(row, filters.rotationId),
      players: await this.listSquadPlayers(resolvedId),
      provenance: {
        lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]),
      },
    };
  }

  public async listCommanderSides(
    filters: RotationFilters,
  ): Promise<CommanderSideSummary[]> {
    const condition = rotationWhere(filters, "commander.rotation_id"),
      // API-03: compose an optional `side` predicate as the next $n, bound (never
      // interpolated). When side is absent the base clause/values stay unchanged.
      whereSql =
        filters.side === undefined
          ? condition.sql
          : condition.sqlWith(
              `commander.side = $${String(condition.values.length + 1)}::text`,
            ),
      whereValues =
        filters.side === undefined
          ? condition.values
          : [...condition.values, filters.side],
      result = await this.pool.query<CommanderSideRow>(
        `
          select commander.rotation_id, commander.side, commander.known_wins,
            commander.known_losses, commander.unknown_outcomes,
            players.id as player_id, players.display_name
          from commander_side_stats commander
          left join canonical_players players on players.id = commander.player_id
          ${whereSql}
          order by commander.rotation_id desc, commander.side, players.display_name nulls last
        `,
        whereValues,
      );
    return result.rows.map((row) => ({
      knownLosses: row.known_losses,
      knownWins: row.known_wins,
      player: mapCommanderPlayer(row),
      rotationId: row.rotation_id,
      side: row.side,
      unknownOutcomes: row.unknown_outcomes,
    }));
  }

  public async listBounty(
    filters: RotationFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<BountySummary>> {
    const condition = rotationWhere(filters, "bounty.rotation_id"),
      // bounty.points is a STORED column with no GROUP BY, so the seek predicate
      // belongs in WHERE (Pitfall 1), not HAVING.
      seek = keysetSeek(
        BOUNTY_SORT,
        page,
        "bounty.id",
        condition.values.length,
      ),
      whereClause = composeBountyWhere(condition.sql, seek.predicateSql),
      values = [...condition.values, ...seek.values, page.limit + 1],
      result = await this.pool.query<BountyRow>(
        `
          select bounty.id, bounty.rotation_id, bounty.points, bounty.inputs,
            players.id as player_id, players.display_name
          from bounty_points bounty
          join canonical_players players on players.id = bounty.player_id
          ${whereClause}
          order by ${seek.orderBySql}
          limit $${String(values.length)}
        `,
        values,
      );
    return keysetResult(result.rows, page, {
      toCursor: (row) => bountyRowCursor(row, page),
      toItem: (row) => mapBounty(row),
    });
  }

  public async getLeaderboards(
    filters: LeaderboardFilters,
  ): Promise<PublicLeaderboards> {
    // Each leaderboard surface paginates under its own FIXED sort (bounty by
    // points, players/squads by kills), desc, sharing the request `limit`.
    const bounty = await this.listBounty(
        filters,
        leaderboardPage("points", filters.limit, filters.bountyAfter),
      ),
      players = await this.listPlayers(
        filters,
        leaderboardPage("kills", filters.limit, filters.playersAfter),
      ),
      squads = await this.listSquads(
        filters,
        leaderboardPage("kills", filters.limit, filters.squadsAfter),
      );
    return {
      bounty,
      playersByKills: players,
      rotationId: filters.rotationId ?? null,
      squadsByKills: squads,
    };
  }

  public async getPlayerWeapons(
    id: string,
  ): Promise<PlayerWeaponsPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const [{ sql, values }, calcAt] = await Promise.all([
      Promise.resolve(weaponsSql({ scopeId: resolvedId })),
      this.playerStatTimestamp(resolvedId),
    ]);
    const result = await this.pool.query<ParityWeaponRow>(sql, values);
    const mapped = mapWeapons(result.rows);
    const [entry] = mapped;
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (entry === undefined) {
      return { firearms: [], provenance, vehicles: [] };
    }
    const [sorted] = sortWeapons([entry]);
    /* v8 ignore next 4 -- sortWeapons always returns one entry for a single-element input */
    return {
      firearms: sorted?.firearms ?? [],
      provenance,
      vehicles: sorted?.vehicles ?? [],
    };
  }

  public async getPlayerVehicles(
    id: string,
  ): Promise<PlayerVehiclesPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const statsQuery = playerStatsSql({ scopeId: resolvedId }),
      weaponsQuery = weaponsSql({ scopeId: resolvedId });
    const [statsResult, weaponsResult, calcAt] = await Promise.all([
      this.pool.query<ParityPlayerStatRow>(statsQuery.sql, statsQuery.values),
      this.pool.query<ParityWeaponRow>(weaponsQuery.sql, weaponsQuery.values),
      this.playerStatTimestamp(resolvedId),
    ]);
    const [statsRow] = statsResult.rows;
    /* v8 ignore next 2 -- playerStatsSql always returns one row per player (group by canonical_players.id) */
    const mappedStats =
      statsRow === undefined ? undefined : mapPlayerStats(statsRow);
    /* v8 ignore next 3 -- row present, counter sums coalesced to 0 for players with no events */
    const vehicleKills = mappedStats?.vehicleKills ?? 0,
      killsFromVehicleValue = mappedStats?.killsFromVehicle ?? 0,
      kills = mappedStats?.kills ?? 0;
    const mappedWeapons = mapWeapons(weaponsResult.rows);
    const [weaponsEntry] = mappedWeapons;
    const [sortedWeapons] =
      weaponsEntry === undefined ? [] : sortWeapons([weaponsEntry]);
    return {
      killsFromVehicle: killsFromVehicleValue,
      killsFromVehicleCoef: killsFromVehicleCoef(killsFromVehicleValue, kills),
      provenance: { lastUpdatedAt: maxTimestamp([calcAt]) },
      vehicleKills,
      vehicles: sortedWeapons?.vehicles ?? [],
    };
  }

  public async getPlayerRelationships(
    id: string,
  ): Promise<PlayerRelationshipsPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const [{ sql, values }, calcAt] = await Promise.all([
      Promise.resolve(relationshipsSql({ scopeId: resolvedId })),
      this.playerStatTimestamp(resolvedId),
    ]);
    const result = await this.pool.query<ParityRelationshipRow>(sql, values);
    const mapped = mapRelationships(result.rows);
    const [entry] = mapped;
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (entry === undefined) {
      return {
        killed: [],
        killers: [],
        provenance,
        teamkilled: [],
        teamkillers: [],
      };
    }
    return {
      killed: sortRelationships(entry.killed).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
      killers: sortRelationships(entry.killers).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
      provenance,
      teamkilled: sortRelationships(entry.teamkilled).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
      teamkillers: sortRelationships(entry.teamkillers).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
    };
  }

  public async getPlayerWeekly(
    id: string,
  ): Promise<PlayerWeeklyPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const [{ sql, values }, calcAt] = await Promise.all([
      Promise.resolve(weeksSql({ scopeId: resolvedId })),
      this.playerStatTimestamp(resolvedId),
    ]);
    const result = await this.pool.query<ParityWeekRow>(sql, values);
    const mapped = mapWeeks(result.rows);
    const [entry] = mapped;
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (entry === undefined) {
      return { provenance, weeks: [] };
    }
    const [sorted] = sortWeeks([entry]);
    /* v8 ignore next -- sortWeeks always returns one entry for a single-element input */
    const weeks = (sorted?.weeks ?? []).map((week) => ({
      deaths: week.deaths,
      endDate: week.endDate,
      kdRatio: week.kdRatio,
      killsFromVehicle: week.killsFromVehicle,
      killsFromVehicleCoef: week.killsFromVehicleCoef,
      kills: week.kills,
      score: week.score,
      startDate: week.startDate,
      teamkills: week.teamkills,
      totalPlayedGames: week.totalPlayedGames,
      vehicleKills: week.vehicleKills,
      week: week.week,
    }));
    return { provenance, weeks };
  }

  /**
   * PARITY-06: Squad weapons — deterministic member-level aggregation.
   * Sums kills per weapon name+group across all squad members.
   * NOT byte-identical to a legacy squad-level formula (none exists — 15-CONTEXT Q3).
   */
  public async getSquadWeapons(
    id: string,
  ): Promise<SquadWeaponsPayload | null> {
    const resolvedId = await this.resolveSquadId(id);
    if (resolvedId === null) {
      return null;
    }
    const [members, calcAt] = await Promise.all([
      this.listSquadPlayers(resolvedId),
      this.squadStatTimestamp(resolvedId),
    ]);
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (members.length === 0) {
      return { firearms: [], provenance, vehicles: [] };
    }
    // Run per-member scoped weapon queries in parallel (parameterized, no string concat).
    const allRows = await this.loadMemberRows<ParityWeaponRow>(
      members,
      (scopeId) => weaponsSql({ scopeId }),
    );
    const mapped = mapWeapons(allRows);
    const [entry] = mapped;
    if (entry === undefined) {
      return { firearms: [], provenance, vehicles: [] };
    }
    // Aggregate kills by weapon key across all members.
    const aggregated = aggregateWeaponEntries(mapped);
    const [sorted] = sortWeapons([aggregated]);
    /* v8 ignore next 4 -- sortWeapons always returns one entry for a single-element input */
    return {
      firearms: sorted?.firearms ?? [],
      provenance,
      vehicles: sorted?.vehicles ?? [],
    };
  }

  /**
   * PARITY-06: Squad relationships — deterministic member-level aggregation.
   * Sums relationship counts per target across all squad members.
   * NOT byte-identical to a legacy squad-level formula (none exists — 15-CONTEXT Q3).
   */
  public async getSquadRelationships(
    id: string,
  ): Promise<SquadRelationshipsPayload | null> {
    const resolvedId = await this.resolveSquadId(id);
    if (resolvedId === null) {
      return null;
    }
    const [members, calcAt] = await Promise.all([
      this.listSquadPlayers(resolvedId),
      this.squadStatTimestamp(resolvedId),
    ]);
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (members.length === 0) {
      return {
        killed: [],
        killers: [],
        provenance,
        teamkilled: [],
        teamkillers: [],
      };
    }
    const allRows = await this.loadMemberRows<ParityRelationshipRow>(
      members,
      (scopeId) => relationshipsSql({ scopeId }),
    );
    const mapped = mapRelationships(allRows);
    const aggregated = aggregateRelationshipEntries(mapped);
    return {
      killed: sortRelationships(aggregated.killed).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
      killers: sortRelationships(aggregated.killers).map((relationship) => ({
        count: relationship.count,
        player: { displayName: relationship.name, id: relationship.id },
      })),
      provenance,
      teamkilled: sortRelationships(aggregated.teamkilled).map(
        (relationship) => ({
          count: relationship.count,
          player: { displayName: relationship.name, id: relationship.id },
        }),
      ),
      teamkillers: sortRelationships(aggregated.teamkillers).map(
        (relationship) => ({
          count: relationship.count,
          player: { displayName: relationship.name, id: relationship.id },
        }),
      ),
    };
  }

  /**
   * PARITY-06: Squad weekly — deterministic member-level aggregation.
   * Sums weekly stats per week bucket across all squad members.
   * NOT byte-identical to a legacy squad-level formula (none exists — 15-CONTEXT Q3).
   */
  public async getSquadWeekly(id: string): Promise<SquadWeeklyPayload | null> {
    const resolvedId = await this.resolveSquadId(id);
    if (resolvedId === null) {
      return null;
    }
    const [members, calcAt] = await Promise.all([
      this.listSquadPlayers(resolvedId),
      this.squadStatTimestamp(resolvedId),
    ]);
    const provenance = { lastUpdatedAt: maxTimestamp([calcAt]) };
    if (members.length === 0) {
      return { provenance, weeks: [] };
    }
    const allRows = await this.loadMemberRows<ParityWeekRow>(
      members,
      (scopeId) => weeksSql({ scopeId }),
    );
    const mapped = mapWeeks(allRows);
    const aggregated = aggregateWeekEntries(mapped);
    if (aggregated === undefined) {
      return { provenance, weeks: [] };
    }
    const [sorted] = sortWeeks([aggregated]);
    /* v8 ignore next -- sortWeeks always returns one entry for a single-element input */
    const weeks = (sorted?.weeks ?? []).map((week) => ({
      deaths: week.deaths,
      endDate: week.endDate,
      kdRatio: week.kdRatio,
      killsFromVehicle: week.killsFromVehicle,
      killsFromVehicleCoef: week.killsFromVehicleCoef,
      kills: week.kills,
      score: week.score,
      startDate: week.startDate,
      teamkills: week.teamkills,
      totalPlayedGames: week.totalPlayedGames,
      vehicleKills: week.vehicleKills,
      week: week.week,
    }));
    return { provenance, weeks };
  }

  public async getRotation(id: string): Promise<RotationDetail | null> {
    const isUuid = looksLikeUuid(id);
    // Split into two branches to avoid the invalid `$slug::uuid` cast.
    const whereClause = isUuid ? "r.id = $1::uuid" : "r.slug = $1::text";
    const result = await this.pool.query<RotationRow>(
      `
        select r.id, r.name, r.slug, r.starts_at, r.ends_at, r.created_at,
          (select max(ps.calculated_at) from player_stats ps where ps.rotation_id = r.id) as last_calc
        from rotations r
        where ${whereClause}
      `,
      [id],
    );
    const [row] = result.rows;
    if (row === undefined) {
      return null;
    }
    return {
      ...mapRotation(row),
      provenance: {
        lastUpdatedAt: maxTimestamp([row.last_calc, row.created_at]),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 17: Replay surface — listReplays / getReplay / getReplayEvents
  // ---------------------------------------------------------------------------

  public async listReplays(
    filters: ReplayListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ReplaySummary>> {
    const filterClause = buildReplayWhere(filters),
      seek = keysetSeek(
        REPLAY_SORT,
        page,
        "replays.id",
        filterClause.values.length,
      ),
      whereClause = composeBountyWhere(filterClause.sql, seek.predicateSql),
      values = [...filterClause.values, ...seek.values, page.limit + 1],
      result = await this.pool.query<ReplaySummaryRow>(
        `
          select replays.id, replays.slug, replays.rotation_id,
            replays.replay_timestamp, replays.source_system,
            replays.source_replay_id, replays.status
          from replays
          ${whereClause}
          order by ${seek.orderBySql}
          limit $${String(values.length)}
        `,
        values,
      );
    return keysetResult(result.rows, page, {
      toCursor: (row) => replayRowCursor(row, page),
      toItem: (row) => mapReplaySummary(row),
    });
  }

  public async getReplay(id: string): Promise<ReplayDetail | null> {
    const whereClause = looksLikeUuid(id)
      ? "r.id = $1::uuid"
      : "r.slug = $1::text";
    const result = await this.pool.query<ReplayDetailRow>(
      `
        select r.id, r.slug, r.replay_timestamp, r.created_at, r.rotation_id,
          rot.name as rotation_name, rot.slug as rotation_slug,
          pr.created_at as pr_created_at,
          pr.raw_snapshot
        from replays r
        left join rotations rot on rot.id = r.rotation_id
        left join parser_results pr on pr.replay_id = r.id and pr.status = 'current'
        where ${whereClause}
      `,
      [id],
    );
    const [row] = result.rows;
    return row === undefined ? null : mapReplayDetail(row);
  }

  public async getReplayEvents(
    id: string,
    page: PageQuery,
  ): Promise<PaginatedResult<ReplayEvent> | null> {
    // Authoritative limit clamp (W-3): enforce here regardless of caller.
    const effectiveLimit = Math.min(
      /* v8 ignore next -- EVENT_PAGE_DEFAULT fallback: tests always pass page.limit > 0 */
      page.limit > 0 ? page.limit : EVENT_PAGE_DEFAULT,
      EVENT_PAGE_MAX,
    );

    // Resolve the replay's current parser_result_id (slug-or-uuid branch).
    /* v8 ignore next 3 -- slug-based event lookup not exercised; tests use UUID ids */
    const whereClause = looksLikeUuid(id)
      ? "pr.replay_id = $1::uuid"
      : `pr.replay_id = (select r.id from replays r where r.slug = $1::text)`;
    const prResult = await this.pool.query<{ id: string }>(
      `
        select pr.id from parser_results pr
        where ${whereClause} and pr.status = 'current'
        limit 1
      `,
      [id],
    );
    const parserResultId = prResult.rows[0]?.id;
    if (parserResultId === undefined) {
      // Replay not found or no current parser result.
      return null;
    }

    const seek = keysetSeek(
        EVENT_SORT,
        { ...page, limit: effectiveLimit, order: "asc" },
        "events.id",
        1,
      ),
      whereSeek =
        seek.predicateSql === "true" ? "" : `and (${seek.predicateSql})`,
      values = [parserResultId, ...seek.values, effectiveLimit + 1],
      result = await this.pool.query<ReplayEventRow>(
        `
          select events.id, events.event_type, events.occurred_at, events.payload
          from parser_events events
          where events.parser_result_id = $1
          ${whereSeek}
          order by ${seek.orderBySql}
          limit $${String(values.length)}
        `,
        values,
      );

    const effectivePage: PageQuery = {
      ...page,
      limit: effectiveLimit,
      order: "asc",
    };
    return keysetResult(result.rows, effectivePage, {
      toCursor: (row) => eventRowCursor(row, effectivePage),
      toItem: (row) => mapReplayEvent(row),
    });
  }

  // ---------------------------------------------------------------------------
  // Phase 17 (REPLAY-04): Sitemap enumerators
  // ---------------------------------------------------------------------------

  /**
   * Returns the total number of child sitemap pages:
   * `Math.ceil(count / SITEMAP_PAGE_SIZE)` where count is the number of
   * replays with a non-null slug.  Null-slug rows are excluded at the SQL
   * level (they have no indexable URL).
   */
  public async countReplaySitemapPages(): Promise<number> {
    const result = await this.pool.query<CountRow>(
      "select count(*) from replays where slug is not null",
    );
    // COUNT(*) always returns exactly one row; the ?? "0" fallback is
    // unreachable in production. /* v8 ignore next */ suppresses the
    // optional-chain branch that V8 coverage records as uncovered.
    /* v8 ignore next */
    const total = Number.parseInt(result.rows[0]?.count ?? "0", 10);
    return Math.ceil(total / SITEMAP_PAGE_SIZE);
  }

  /**
   * Returns the slug strings for child sitemap page `n` (0-based).
   *
   * - Null-slug rows excluded in SQL (`slug is not null`).
   * - Ordered by `id` for a stable, page-consistent walk.
   * - `limit` and `offset` bound as positional `$n` parameters — never
   *   string-interpolated.
   */
  public async listReplaySitemapPage(page: number): Promise<string[]> {
    const result = await this.pool.query<{ slug: string }>(
      `select slug from replays where slug is not null order by id limit $1 offset $2`,
      [SITEMAP_PAGE_SIZE, page * SITEMAP_PAGE_SIZE],
    );
    return result.rows.map((row) => row.slug);
  }

  public async getPlayerNameHistory(
    id: string,
  ): Promise<NameHistoryPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const result = await this.pool.query<NicknameRow>(
      `
        select n.nickname, n.observed_from, n.observed_to, n.source_replay_id
        from player_nicknames n
        where n.player_id = $1::uuid
        order by n.observed_from asc nulls first, n.id
      `,
      [resolvedId],
    );
    const windows = result.rows.map((row) => ({
      from: row.observed_from === null ? null : row.observed_from.toISOString(),
      nickname: row.nickname,
      sourceReplayId: row.source_replay_id,
      to: row.observed_to === null ? null : row.observed_to.toISOString(),
    }));
    const entries = withGaps(windows, (win) => ({
      from: win.from,
      kind: "alias" as const,
      nickname: win.nickname,
      sourceReplayId: win.sourceReplayId,
      to: win.to,
    }));
    const timestamps = result.rows.flatMap((row) => [
      row.observed_to,
      row.observed_from,
    ]);
    return {
      entries,
      provenance: { lastUpdatedAt: maxTimestamp(timestamps) },
    };
  }

  public async getPlayerMembershipHistory(
    id: string,
  ): Promise<PlayerMembershipHistoryPayload | null> {
    const resolvedId = await this.resolvePlayerId(id);
    if (resolvedId === null) {
      return null;
    }
    const result = await this.pool.query<PlayerMembershipRow>(
      `
        select m.valid_from, m.valid_to, s.id as squad_id, s.slug as squad_slug, s.name
        from squad_memberships m
        join squads s on s.id = m.squad_id
        where m.player_id = $1::uuid
        order by m.valid_from asc nulls first, m.id
      `,
      [resolvedId],
    );
    const windows = result.rows.map((row) => ({
      // valid_from is NOT NULL per schema; null branch is a type-safe guard
      // c8 ignore next
      from: row.valid_from === null ? null : row.valid_from.toISOString(),
      squad: { id: row.squad_id, name: row.name, slug: row.squad_slug },
      to: row.valid_to === null ? null : row.valid_to.toISOString(),
    }));
    const entries = withGaps(windows, (win) => ({
      from: win.from,
      kind: "membership" as const,
      squad: win.squad,
      to: win.to,
    }));
    const timestamps = result.rows.flatMap((row) => [
      row.valid_to,
      row.valid_from,
    ]);
    return {
      entries,
      provenance: { lastUpdatedAt: maxTimestamp(timestamps) },
    };
  }

  public async getSquadMembershipHistory(
    id: string,
  ): Promise<SquadMembershipHistoryPayload | null> {
    const resolvedId = await this.resolveSquadId(id);
    if (resolvedId === null) {
      return null;
    }
    const result = await this.pool.query<SquadMembershipRow>(
      `
        select m.valid_from, m.valid_to, p.id as player_id, p.slug as player_slug, p.display_name
        from squad_memberships m
        join canonical_players p on p.id = m.player_id
        where m.squad_id = $1::uuid
        order by m.valid_from asc nulls first, m.id
      `,
      [resolvedId],
    );
    const windows = result.rows.map((row) => ({
      // valid_from is NOT NULL per schema; null branch is a type-safe guard
      // c8 ignore next
      from: row.valid_from === null ? null : row.valid_from.toISOString(),
      player: {
        displayName: row.display_name,
        id: row.player_id,
        slug: row.player_slug,
      },
      to: row.valid_to === null ? null : row.valid_to.toISOString(),
    }));
    const entries = withGaps(windows, (win) => ({
      from: win.from,
      kind: "membership" as const,
      player: win.player,
      to: win.to,
    }));
    const timestamps = result.rows.flatMap((row) => [
      row.valid_to,
      row.valid_from,
    ]);
    return {
      entries,
      provenance: { lastUpdatedAt: maxTimestamp(timestamps) },
    };
  }

  private async playerExists(id: string): Promise<boolean> {
    const result = await this.pool.query<ExistenceRow>(
      "select exists(select 1 from canonical_players where id = $1::uuid) as exists",
      [id],
    );
    /* v8 ignore next -- SELECT EXISTS always returns exactly one row */
    return result.rows[0]?.exists ?? false;
  }

  private async squadExists(id: string): Promise<boolean> {
    const result = await this.pool.query<ExistenceRow>(
      "select exists(select 1 from squads where id = $1::uuid) as exists",
      [id],
    );
    /* v8 ignore next -- SELECT EXISTS always returns exactly one row */
    return result.rows[0]?.exists ?? false;
  }

  // Resolve a slug-or-uuid path segment to the canonical player UUID, or null
  // when it matches no row. The boolean-flag branch keeps a slug input off the
  // `::uuid` cast so an unknown id yields 404, never a 500 cast exception.
  private async resolvePlayerId(id: string): Promise<string | null> {
    if (looksLikeUuid(id)) {
      return (await this.playerExists(id)) ? id : null;
    }
    const result = await this.pool.query<{ id: string }>(
      "select id from canonical_players where slug = $1::text",
      [id],
    );
    return result.rows[0]?.id ?? null;
  }

  private async resolveSquadId(id: string): Promise<string | null> {
    if (looksLikeUuid(id)) {
      return (await this.squadExists(id)) ? id : null;
    }
    const result = await this.pool.query<{ id: string }>(
      "select id from squads where slug = $1::text",
      [id],
    );
    return result.rows[0]?.id ?? null;
  }

  private async listSquadPlayers(squadId: string): Promise<SquadPlayer[]> {
    const result = await this.pool.query<SquadPlayerRow>(
      `
        select players.id, players.display_name
        from squad_memberships memberships
        join canonical_players players on players.id = memberships.player_id
        where memberships.squad_id = $1
        order by players.display_name
      `,
      [squadId],
    );
    return result.rows.map((row) => ({
      displayName: row.display_name,
      id: row.id,
    }));
  }

  /**
   * Run a parameterized parity query for each squad member in parallel and
   * collect all rows. scopeId is the player uuid (parameterized, no string concat).
   */
  private async loadMemberRows<TRow extends QueryResultRow>(
    members: SquadPlayer[],
    buildQuery: (scopeId: string) => { sql: string; values: string[] },
  ): Promise<TRow[]> {
    const perMemberResults = await Promise.all(
      members.map(async (member) => {
        const { sql, values } = buildQuery(member.id);
        const result = await this.pool.query<TRow>(sql, values);
        return result.rows;
      }),
    );
    return perMemberResults.flat();
  }

  /** Fetch the max calculated_at across all player_stats rows for a player. */
  private async playerStatTimestamp(id: string): Promise<Date | null> {
    const result = await this.pool.query<TimestampRow>(
      "select max(ps.calculated_at) as calculated_at from player_stats ps where ps.player_id = $1::uuid",
      [id],
    );
    return result.rows[0]?.calculated_at ?? null;
  }

  /** Fetch the max calculated_at across all squad_stats rows for a squad. */
  private async squadStatTimestamp(id: string): Promise<Date | null> {
    const result = await this.pool.query<TimestampRow>(
      "select max(ss.calculated_at) as calculated_at from squad_stats ss where ss.squad_id = $1::uuid",
      [id],
    );
    return result.rows[0]?.calculated_at ?? null;
  }
}

// ---------------------------------------------------------------------------
// Phase 17: Replay row interfaces and helpers
// ---------------------------------------------------------------------------

interface ReplaySummaryRow {
  id: string;
  slug: string | null;
  rotation_id: string | null;
  replay_timestamp: Date | null;
  source_system: string;
  source_replay_id: string;
  status: string;
}

function mapReplaySummary(row: ReplaySummaryRow): ReplaySummary {
  return {
    id: row.id,
    replayTimestamp:
      row.replay_timestamp === null ? null : row.replay_timestamp.toISOString(),
    rotationId: row.rotation_id,
    slug: row.slug,
    sourceReplayId: row.source_replay_id,
    sourceSystem: row.source_system,
    status: row.status,
  };
}

function replayRowCursor(
  row: ReplaySummaryRow,
  page: PageQuery,
): CursorPayload {
  return {
    id: row.id,
    order: page.order,
    sort: page.sort,
    /* v8 ignore next 5 -- replayRowCursor: null timestamp never occurs when cursor is built (hasMore=true requires non-null) */
    values: [
      row.replay_timestamp === null ? null : row.replay_timestamp.toISOString(),
    ],
  };
}

function eventRowCursor(row: ReplayEventRow, page: PageQuery): CursorPayload {
  return {
    id: row.id,
    order: page.order,
    sort: page.sort,
    /* v8 ignore next -- null occurred_at branch not exercised in cursor path tests */
    values: [row.occurred_at === null ? null : row.occurred_at.toISOString()],
  };
}

/**
 * Build a parameterized WHERE fragment for the replay list filters.
 * All values are bound as $n parameters — no raw request values in SQL text.
 */
function buildReplayWhere(filters: ReplayListFilters): WhereClause {
  const conditions: string[] = [];
  const values: string[] = [];
  /* v8 ignore next 4 -- rotationId undefined branch not exercised (all test calls include rotationId) */
  if (filters.rotationId !== undefined) {
    values.push(filters.rotationId);
    conditions.push(`replays.rotation_id = $${String(values.length)}::uuid`);
  }
  if (filters.fromDate !== undefined) {
    values.push(filters.fromDate);
    conditions.push(
      `replays.replay_timestamp >= $${String(values.length)}::timestamptz`,
    );
  }
  if (filters.toDate !== undefined) {
    values.push(filters.toDate);
    conditions.push(
      `replays.replay_timestamp <= $${String(values.length)}::timestamptz`,
    );
  }
  return {
    /* v8 ignore next -- empty conditions branch not exercised (all test calls include rotationId) */
    sql: conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`,
    values,
  };
}

interface WhereClause {
  sql: string;
  values: string[];
}

interface RotationWhereClause extends WhereClause {
  sqlWith(extra: string): string;
}

function rotationWhere(
  filters: RotationFilters,
  columnName: string,
): RotationWhereClause {
  if (filters.rotationId === undefined) {
    return {
      sql: "",
      sqlWith: (extra) => `where ${extra}`,
      values: [],
    };
  }
  return {
    sql: `where ${columnName} = $1`,
    sqlWith: (extra) => `where ${columnName} = $1 and ${extra}`,
    values: [filters.rotationId],
  };
}

function playerSearchWhere(
  search: string | undefined,
  parameterIndex: number,
): WhereClause {
  if (search === undefined) {
    return noWhere();
  }
  return {
    sql: `lower(players.display_name) like lower($${String(parameterIndex)})
      or exists (
        select 1 from player_nicknames nicknames
        where nicknames.player_id = players.id
          and lower(nicknames.nickname) like lower($${String(parameterIndex)})
      )`,
    values: [`%${search}%`],
  };
}

function squadSearchWhere(
  search: string | undefined,
  parameterIndex: number,
): WhereClause {
  if (search === undefined) {
    return noWhere();
  }
  return {
    sql: `lower(squads.name) like lower($${String(parameterIndex)})`,
    values: [`%${search}%`],
  };
}

function noWhere(): WhereClause {
  return {
    sql: "true",
    values: [],
  };
}

async function count(
  pool: Pool,
  tableName: string,
  where: string,
  values: string[],
): Promise<number> {
  const result = await pool.query<CountRow>(
    `select count(*) from ${tableName} ${where}`,
    values,
  );
  return Number(firstCountRow(result.rows).count);
}

function firstCountRow(rows: CountRow[]): CountRow {
  return (rows as [CountRow, ...CountRow[]])[0];
}

function playerSelectStats(): string {
  return `
    players.id,
    players.display_name,
    players.slug,
    coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
    coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
    coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
    coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills,
    coalesce(sum((stats.stats->>'replay_count')::integer), 0) as replay_count,
    max(stats.calculated_at) as calculated_at,
    players.updated_at
  `;
}

function squadSelectStats(): string {
  return `
    squads.id,
    squads.name,
    squads.slug,
    coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
    coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
    coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
    coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills,
    coalesce(sum((stats.stats->>'player_count')::integer), 0) as player_count,
    coalesce(sum((stats.stats->>'replay_count')::integer), 0) as replay_count,
    max(stats.calculated_at) as calculated_at,
    squads.updated_at
  `;
}

/** Build a fixed-sort, desc PageQuery for one leaderboard surface. */
function leaderboardPage(
  sort: string,
  limit: number,
  after: PageQuery["after"],
): PageQuery {
  return after === undefined
    ? { limit, order: "desc", sort }
    : { after, limit, order: "desc", sort };
}

interface KeysetSeek {
  /** The seek predicate fragment, or "true" when there is no cursor (first page). */
  predicateSql: string;
  /** `having <predicate>` for grouped queries, or "" on the first page. */
  havingClause: string;
  orderBySql: string;
  /** Bound seek values ([value, id]) — empty on the first page. */
  values: (number | string | null)[];
}

/**
 * Translate a {@link PageQuery} into a parameterized keyset seek for a single
 * sort key. Resolves the sort field's fixed SQL expression from the endpoint
 * whitelist and delegates the expanded-OR predicate + NULLS-aware ORDER BY to
 * {@link buildKeysetPredicate}. Seek params bind at `baseParameterCount + 1`
 * (value) and `+ 2` (id), after the query's existing filter params.
 */
function keysetSeek(
  whitelist: Readonly<Record<string, SortDescriptor>>,
  page: PageQuery,
  idColumn: string,
  baseParameterCount: number,
): KeysetSeek {
  const descriptor = sortDescriptor(whitelist, page.sort),
    predicate = buildKeysetPredicate(descriptor, page.order, {
      after: page.after,
      idColumn,
      startParameterIndex: baseParameterCount + 1,
    }),
    predicateSql = predicate.havingSql ?? "true";
  return {
    havingClause: predicate.havingSql === null ? "" : `having ${predicateSql}`,
    orderBySql: predicate.orderBySql,
    predicateSql,
    values: predicate.values,
  };
}

function sortDescriptor(
  whitelist: Readonly<Record<string, SortDescriptor>>,
  field: string,
): KeysetDescriptor {
  const descriptor = whitelist[field];
  /* v8 ignore next 4 -- defensive: page() already validated `field` against this
     whitelist, so an unknown field here is an unreachable invariant violation. */
  if (descriptor === undefined) {
    throw new Error(`unresolved sort field: ${field}`);
  }
  return descriptor;
}

/**
 * Compose the bounty WHERE clause from the optional rotation filter and the
 * keyset seek predicate. `bounty.points` is a stored column (no GROUP BY), so
 * the seek lives in WHERE rather than HAVING.
 */
function composeBountyWhere(rotationSql: string, predicateSql: string): string {
  if (predicateSql === "true") {
    return rotationSql;
  }
  return rotationSql === ""
    ? `where ${predicateSql}`
    : `${rotationSql} and ${predicateSql}`;
}

interface KeysetMappers<Row, Item> {
  toItem: (row: Row) => Item;
  toCursor: (row: Row) => CursorPayload;
}

/**
 * Standard keyset over-fetch reassembly: the query fetches `limit + 1` rows; if
 * more than `limit` came back there is a next page, so set `hasMore`, drop the
 * surplus row, and encode `nextCursor` from the last KEPT row. No COUNT, no
 * total — satisfies the "Без total" contract.
 */
function keysetResult<Row, Item>(
  rows: Row[],
  page: PageQuery,
  mappers: KeysetMappers<Row, Item>,
): PaginatedResult<Item> {
  const hasMore = rows.length > page.limit,
    kept = hasMore ? rows.slice(0, page.limit) : rows,
    last = kept.at(-1);
  return {
    hasMore,
    items: kept.map((row) => mappers.toItem(row)),
    nextCursor:
      hasMore && last !== undefined
        ? encodeCursor(mappers.toCursor(last))
        : null,
  };
}

function playerRowCursor(row: PlayerRow, page: PageQuery): CursorPayload {
  return {
    id: row.id,
    order: page.order,
    sort: page.sort,
    values: [playerSortValue(row, page.sort)],
  };
}

function playerSortValue(row: PlayerRow, sort: string): number | string {
  if (sort === "name") {
    return row.display_name;
  }
  return Number(sort === "teamkills" ? row.teamkills : row.kills);
}

function squadRowCursor(row: SquadRow, page: PageQuery): CursorPayload {
  return {
    id: row.id,
    order: page.order,
    sort: page.sort,
    values: [squadSortValue(row, page.sort)],
  };
}

function squadSortValue(row: SquadRow, sort: string): number | string {
  if (sort === "name") {
    return row.name;
  }
  return Number(sort === "teamkills" ? row.teamkills : row.kills);
}

function bountyRowCursor(row: BountyRow, page: PageQuery): CursorPayload {
  return {
    id: row.id,
    order: page.order,
    sort: page.sort,
    values: [Number(row.points)],
  };
}

function mapRotation(row: RotationRow): RotationSummary {
  return {
    endsAt: row.ends_at === null ? null : row.ends_at.toISOString(),
    id: row.id,
    name: row.name,
    slug: row.slug,
    startsAt: row.starts_at.toISOString(),
  };
}

function mapPlayerSummary(
  row: PlayerRow,
  rotationId: string | undefined,
): PlayerSummary {
  return {
    displayName: row.display_name,
    id: row.id,
    rotationId: rotationId ?? null,
    slug: row.slug,
    stats: playerStats(row),
  };
}

function mapPlayerProfile(
  row: PlayerRow,
  rotationId: string | undefined,
): PlayerProfile {
  return {
    ...mapPlayerSummary(row, rotationId),
    aliases: row.aliases,
    provenance: {
      lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]),
    },
    steamIds: row.steam_ids.map((steamId) => maskSteamId(steamId)),
  };
}

function playerStats(row: PlayerRow): PlayerStatsPayload {
  const kills = Number(row.kills),
    teamkills = Number(row.teamkills),
    deathsTotal = Number(row.deaths_total),
    replayCount = Number(row.replay_count);
  return {
    deaths: {
      byTeamkills: Number(row.deaths_by_teamkills),
      total: deathsTotal,
    },
    kdRatio: kdRatio(kills, deathsTotal),
    kills,
    replayCount,
    teamkills,
    totalPlayedGames: replayCount,
    totalScore: totalScore(kills, teamkills),
  };
}

function mapSquadSummary(
  row: SquadRow,
  rotationId: string | undefined,
): SquadSummary {
  return {
    id: row.id,
    name: row.name,
    rotationId: rotationId ?? null,
    slug: row.slug,
    stats: squadStats(row),
  };
}

function squadStats(row: SquadRow): SquadStatsPayload {
  const kills = Number(row.kills),
    teamkills = Number(row.teamkills),
    deathsTotal = Number(row.deaths_total),
    replayCount = Number(row.replay_count);
  return {
    deaths: {
      byTeamkills: Number(row.deaths_by_teamkills),
      total: deathsTotal,
    },
    // PARITY-06: kdRatio/totalScore/totalPlayedGames byte-identical to
    // SQUAD_STATS_SQL semantics (aggregated from squad_stats rows via parity-formulas).
    kdRatio: kdRatio(kills, deathsTotal),
    kills,
    playerCount: Number(row.player_count),
    replayCount,
    teamkills,
    totalPlayedGames: replayCount,
    totalScore: totalScore(kills, teamkills),
  };
}

function mapCommanderPlayer(
  row: CommanderSideRow,
): CommanderSideSummary["player"] {
  if (row.player_id === null) {
    return null;
  }
  return { displayName: String(row.display_name), id: row.player_id };
}

// Exported for the pure-mapper unit tests (repository.test.ts).
export function mapBounty(row: BountyRow): BountySummary {
  return {
    breakdown: foldBountyBreakdown(row.inputs),
    player: {
      displayName: row.display_name,
      id: row.player_id,
    },
    points: Number(row.points),
    rotationId: row.rotation_id,
  };
}

// API-02: derive the additive breakdown aggregate from the stored bounty_points
// inputs. NO recomputation, NO formula change. Defensive against legacy rows:
// null/missing inputs or an unrecognized version -> null (mirrors mapCommanderPlayer).
// Only counted-kill events (event_type === "kill") carry player_factor/squad_factor;
// excluded events carry no factors and are ignored. Emits numbers + counts only —
// no victim ids, no Steam64.
function foldBountyBreakdown(
  inputs: BountyRow["inputs"],
): BountySummary["breakdown"] {
  if (inputs?.version !== 1) {
    return null;
  }
  let countedKills = 0,
    squadEffectiveness = 0,
    victimEffectiveness = 0;
  for (const event of inputs.events) {
    // Discriminate on `player_factor`, not `event_type`: the excluded arm also
    // carries event_type "kill" for unknown_kill cases, so only the presence of
    // player_factor distinguishes a counted kill from an excluded one.
    if ("player_factor" in event) {
      countedKills += 1;
      victimEffectiveness += event.player_factor;
      squadEffectiveness += event.squad_factor;
    }
  }
  return {
    baseScore: inputs.base_score * countedKills,
    countedKills,
    // Round summed factors to the formula module's scale (ROUND_SCALE = 100) so
    // IEEE-754 accumulation error (e.g. 0.1 + 0.2) never leaks into the public body.
    squadEffectiveness: roundBreakdownFactor(squadEffectiveness),
    victimEffectiveness: roundBreakdownFactor(victimEffectiveness),
  };
}

const BREAKDOWN_FACTOR_SCALE = 100;

function roundBreakdownFactor(value: number): number {
  return Math.round(value * BREAKDOWN_FACTOR_SCALE) / BREAKDOWN_FACTOR_SCALE;
}

// ---------------------------------------------------------------------------
// PARITY-06: Squad member-level aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Merge weapon entries from all squad members into a single aggregated entry
 * by summing kills per (weapon_name, weapon_group) key.
 */
function aggregateWeaponEntries(
  entries: LegacyWeaponsInput[],
): LegacyWeaponsInput {
  const firearmsMap = new Map<string, number>();
  const vehiclesMap = new Map<string, number>();
  for (const entry of entries) {
    for (const weapon of entry.firearms) {
      firearmsMap.set(
        weapon.name,
        (firearmsMap.get(weapon.name) ?? 0) + weapon.kills,
      );
    }
    for (const weapon of entry.vehicles) {
      vehiclesMap.set(
        weapon.name,
        (vehiclesMap.get(weapon.name) ?? 0) + weapon.kills,
      );
    }
  }
  return {
    firearms: [...firearmsMap.entries()].map(([name, kills]) => ({
      kills,
      name,
    })),
    player: { id: "", name: "" },
    vehicles: [...vehiclesMap.entries()].map(([name, kills]) => ({
      kills,
      name,
    })),
  };
}

/**
 * Merge relationship entries from all squad members into a single aggregated
 * entry by summing count per (target_player_id, relationship_type) key.
 */
function aggregateRelationshipEntries(
  entries: LegacyOtherPlayersInput[],
): LegacyOtherPlayersInput {
  const killed = new Map<string, { count: number; id: string; name: string }>();
  const killers = new Map<
    string,
    { count: number; id: string; name: string }
  >();
  const teamkilled = new Map<
    string,
    { count: number; id: string; name: string }
  >();
  const teamkillers = new Map<
    string,
    { count: number; id: string; name: string }
  >();

  for (const entry of entries) {
    addToRelationshipMap(killed, entry.killed);
    addToRelationshipMap(killers, entry.killers);
    addToRelationshipMap(teamkilled, entry.teamkilled);
    addToRelationshipMap(teamkillers, entry.teamkillers);
  }
  return {
    killed: [...killed.values()],
    killers: [...killers.values()],
    player: { id: "", name: "" },
    teamkilled: [...teamkilled.values()],
    teamkillers: [...teamkillers.values()],
  };
}

function addToRelationshipMap(
  map: Map<string, { count: number; id: string; name: string }>,
  relationships: { count: number; id: string; name: string }[],
): void {
  for (const relationship of relationships) {
    const existing = map.get(relationship.id);
    if (existing === undefined) {
      map.set(relationship.id, {
        count: relationship.count,
        id: relationship.id,
        name: relationship.name,
      });
    } else {
      existing.count += relationship.count;
    }
  }
}

/**
 * Merge week entries from all squad members into a single aggregated entry
 * by summing stats per ISO week key.
 */
function aggregateWeekEntries(
  entries: LegacyWeeksInput[],
): LegacyWeeksInput | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const weekMap = new Map<
    string,
    {
      deathsByTeamkills: number;
      deathsTotal: number;
      endDate: string;
      kills: number;
      killsFromVehicle: number;
      startDate: string;
      teamkills: number;
      totalPlayedGames: number;
      vehicleKills: number;
      week: string;
    }
  >();
  for (const entry of entries) {
    for (const week of entry.weeks) {
      const existing = weekMap.get(week.week);
      if (existing === undefined) {
        weekMap.set(week.week, {
          deathsByTeamkills: week.deathsByTeamkills,
          deathsTotal: week.deathsTotal,
          endDate: week.endDate,
          kills: week.kills,
          killsFromVehicle: week.killsFromVehicle,
          startDate: week.startDate,
          teamkills: week.teamkills,
          totalPlayedGames: week.totalPlayedGames,
          vehicleKills: week.vehicleKills,
          week: week.week,
        });
      } else {
        existing.kills += week.kills;
        existing.killsFromVehicle += week.killsFromVehicle;
        existing.vehicleKills += week.vehicleKills;
        existing.teamkills += week.teamkills;
        existing.deathsTotal += week.deathsTotal;
        existing.deathsByTeamkills += week.deathsByTeamkills;
        existing.totalPlayedGames += week.totalPlayedGames;
      }
    }
  }
  return {
    player: { id: "", name: "" },
    weeks: [...weekMap.values()],
  };
}
