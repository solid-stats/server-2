/* eslint-disable max-lines, max-params, no-magic-numbers, unicorn/no-null */
import {
  sortRelationships,
  sortWeapons,
  sortWeeks,
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
  PLAYER_SORT,
  SQUAD_SORT,
  type SortDescriptor,
} from "./routes/pagination/sort.js";

import type {
  BountySummary,
  CommanderSideSummary,
  LeaderboardFilters,
  OverviewFilters,
  PageQuery,
  PaginatedResult,
  PlayerListFilters,
  PlayerProfile,
  PlayerRelationshipsPayload,
  PlayerStatsPayload,
  PlayerSummary,
  PlayerVehiclesPayload,
  PlayerWeaponsPayload,
  PlayerWeeklyPayload,
  PublicLeaderboards,
  PublicStatsReadModel,
  RotationFilters,
  RotationSummary,
  SquadListFilters,
  SquadProfile,
  SquadStatsPayload,
  SquadSummary,
  StatsOverview,
} from "./routes/models.js";
import type { Pool } from "pg";

interface CountRow {
  count: string;
}

interface RotationRow {
  ends_at: Date | null;
  id: string;
  name: string;
  starts_at: Date;
}

interface PlayerRow {
  aliases: string[];
  deaths_by_teamkills: string;
  deaths_total: string;
  display_name: string;
  id: string;
  kills: string;
  replay_count: string;
  steam_ids: string[];
  teamkills: string;
}

interface SquadRow {
  deaths_by_teamkills: string;
  deaths_total: string;
  id: string;
  kills: string;
  name: string;
  player_count: string;
  replay_count: string;
  teamkills: string;
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

interface BountyRow {
  display_name: string;
  id: string;
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
      "select id, name, starts_at, ends_at from rotations order by starts_at desc, id",
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
          group by players.id, players.display_name
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
        where players.id = $1
        group by players.id, players.display_name
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
          group by squads.id, squads.name
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
    const result = await this.pool.query<SquadRow>(
      `
        select ${squadSelectStats()}
        from squads
        left join squad_stats stats on stats.squad_id = squads.id
          and ($2::uuid is null or stats.rotation_id = $2::uuid)
        where squads.id = $1
        group by squads.id, squads.name
      `,
      [id, filters.rotationId ?? null],
    );
    const [row] = result.rows;
    if (row === undefined) {
      return null;
    }
    return {
      ...mapSquadSummary(row, filters.rotationId),
      players: await this.listSquadPlayers(id),
    };
  }

  public async listCommanderSides(
    filters: RotationFilters,
  ): Promise<CommanderSideSummary[]> {
    const condition = rotationWhere(filters, "commander.rotation_id"),
      result = await this.pool.query<CommanderSideRow>(
        `
          select commander.rotation_id, commander.side, commander.known_wins,
            commander.known_losses, commander.unknown_outcomes,
            players.id as player_id, players.display_name
          from commander_side_stats commander
          left join canonical_players players on players.id = commander.player_id
          ${condition.sql}
          order by commander.rotation_id desc, commander.side, players.display_name nulls last
        `,
        condition.values,
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
          select bounty.id, bounty.rotation_id, bounty.points,
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
    const exists = await this.playerExists(id);
    if (!exists) {
      return null;
    }
    const { sql, values } = weaponsSql({ scopeId: id });
    const result = await this.pool.query<ParityWeaponRow>(sql, values);
    const mapped = mapWeapons(result.rows);
    const [entry] = mapped;
    if (entry === undefined) {
      return { firearms: [], vehicles: [] };
    }
    const [sorted] = sortWeapons([entry]);
    return {
      firearms: sorted?.firearms ?? [],
      vehicles: sorted?.vehicles ?? [],
    };
  }

  public async getPlayerVehicles(
    id: string,
  ): Promise<PlayerVehiclesPayload | null> {
    const exists = await this.playerExists(id);
    if (!exists) {
      return null;
    }
    const statsQuery = playerStatsSql({ scopeId: id }),
      weaponsQuery = weaponsSql({ scopeId: id });
    const [statsResult, weaponsResult] = await Promise.all([
      this.pool.query<ParityPlayerStatRow>(statsQuery.sql, statsQuery.values),
      this.pool.query<ParityWeaponRow>(weaponsQuery.sql, weaponsQuery.values),
    ]);
    const [statsRow] = statsResult.rows;
    const mappedStats = statsRow === undefined ? undefined : mapPlayerStats(statsRow);
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
      vehicleKills,
      vehicles: sortedWeapons?.vehicles ?? [],
    };
  }

  public async getPlayerRelationships(
    id: string,
  ): Promise<PlayerRelationshipsPayload | null> {
    const exists = await this.playerExists(id);
    if (!exists) {
      return null;
    }
    const { sql, values } = relationshipsSql({ scopeId: id });
    const result = await this.pool.query<ParityRelationshipRow>(sql, values);
    const mapped = mapRelationships(result.rows);
    const [entry] = mapped;
    if (entry === undefined) {
      return { killed: [], killers: [], teamkilled: [], teamkillers: [] };
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
    const exists = await this.playerExists(id);
    if (!exists) {
      return null;
    }
    const { sql, values } = weeksSql({ scopeId: id });
    const result = await this.pool.query<ParityWeekRow>(sql, values);
    const mapped = mapWeeks(result.rows);
    const [entry] = mapped;
    if (entry === undefined) {
      return { weeks: [] };
    }
    const [sorted] = sortWeeks([entry]);
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
    return { weeks };
  }

  private async playerExists(id: string): Promise<boolean> {
    const result = await this.pool.query<ExistenceRow>(
      "select exists(select 1 from canonical_players where id = $1::uuid) as exists",
      [id],
    );
    return result.rows[0]?.exists ?? false;
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
    coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
    coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
    coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
    coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills,
    coalesce(sum((stats.stats->>'replay_count')::integer), 0) as replay_count
  `;
}

function squadSelectStats(): string {
  return `
    squads.id,
    squads.name,
    coalesce(sum((stats.stats->>'kills')::integer), 0) as kills,
    coalesce(sum((stats.stats->>'teamkills')::integer), 0) as teamkills,
    coalesce(sum((stats.stats#>>'{deaths,total}')::integer), 0) as deaths_total,
    coalesce(sum((stats.stats#>>'{deaths,by_teamkills}')::integer), 0) as deaths_by_teamkills,
    coalesce(sum((stats.stats->>'player_count')::integer), 0) as player_count,
    coalesce(sum((stats.stats->>'replay_count')::integer), 0) as replay_count
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
    stats: squadStats(row),
  };
}

function squadStats(row: SquadRow): SquadStatsPayload {
  return {
    deaths: {
      byTeamkills: Number(row.deaths_by_teamkills),
      total: Number(row.deaths_total),
    },
    kills: Number(row.kills),
    playerCount: Number(row.player_count),
    replayCount: Number(row.replay_count),
    teamkills: Number(row.teamkills),
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

function mapBounty(row: BountyRow): BountySummary {
  return {
    player: {
      displayName: row.display_name,
      id: row.player_id,
    },
    points: Number(row.points),
    rotationId: row.rotation_id,
  };
}
