/* eslint-disable max-lines, max-params, no-magic-numbers, unicorn/no-null */
import type {
  BountySummary,
  CommanderSideSummary,
  LeaderboardFilters,
  OverviewFilters,
  PageQuery,
  PaginatedResult,
  PlayerListFilters,
  PlayerProfile,
  PlayerStatsPayload,
  PlayerSummary,
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
      values = [
        filters.rotationId ?? null,
        ...search.values,
        ...paginationValues(page),
      ],
      result = await this.pool.query<PlayerRow>(
        `
          select ${playerSelectStats()}
          from canonical_players players
          left join player_stats stats on stats.player_id = players.id
            and ($1::uuid is null or stats.rotation_id = $1::uuid)
          where ${search.sql}
          group by players.id, players.display_name
          order by kills desc, players.display_name
          limit $${String(search.values.length + 2)}
          offset $${String(search.values.length + 3)}
        `,
        values,
      ),
      countSearch = playerSearchWhere(filters.search, 1),
      total = await this.pool.query<CountRow>(
        `select count(*) from canonical_players players where ${countSearch.sql}`,
        countSearch.values,
      );
    return pageResult(
      result.rows.map((row) => mapPlayerSummary(row, filters.rotationId)),
      page,
      firstCountRow(total.rows).count,
    );
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
      values = [
        filters.rotationId ?? null,
        ...search.values,
        ...paginationValues(page),
      ],
      result = await this.pool.query<SquadRow>(
        `
          select ${squadSelectStats()}
          from squads
          left join squad_stats stats on stats.squad_id = squads.id
            and ($1::uuid is null or stats.rotation_id = $1::uuid)
          where ${search.sql}
          group by squads.id, squads.name
          order by kills desc, squads.name
          limit $${String(search.values.length + 2)}
          offset $${String(search.values.length + 3)}
        `,
        values,
      ),
      countSearch = squadSearchWhere(filters.search, 1),
      total = await this.pool.query<CountRow>(
        `select count(*) from squads where ${countSearch.sql}`,
        countSearch.values,
      );
    return pageResult(
      result.rows.map((row) => mapSquadSummary(row, filters.rotationId)),
      page,
      firstCountRow(total.rows).count,
    );
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
      values = [...condition.values, ...paginationValues(page)],
      result = await this.pool.query<BountyRow>(
        `
          select bounty.rotation_id, bounty.points, players.id as player_id, players.display_name
          from bounty_points bounty
          join canonical_players players on players.id = bounty.player_id
          ${condition.sql}
          order by bounty.points desc, players.display_name
          limit $${String(condition.values.length + 1)}
          offset $${String(condition.values.length + 2)}
        `,
        values,
      ),
      total = await this.pool.query<CountRow>(
        `select count(*) from bounty_points bounty ${condition.sql}`,
        condition.values,
      );
    return pageResult(
      result.rows.map((row) => mapBounty(row)),
      page,
      firstCountRow(total.rows).count,
    );
  }

  public async getLeaderboards(
    filters: LeaderboardFilters,
  ): Promise<PublicLeaderboards> {
    const page = { page: 1, pageSize: filters.limit },
      bounty = await this.listBounty(filters, page),
      players = await this.listPlayers(filters, page),
      squads = await this.listSquads(filters, page);
    return {
      bounty: bounty.items,
      playersByKills: players.items,
      rotationId: filters.rotationId ?? null,
      squadsByKills: squads.items,
    };
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

function paginationValues(page: PageQuery): number[] {
  return [page.pageSize, (page.page - 1) * page.pageSize];
}

function pageResult<T>(
  items: T[],
  page: PageQuery,
  total: string,
): PaginatedResult<T> {
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    total: Number(total),
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
    steamIds: row.steam_ids,
  };
}

function playerStats(row: PlayerRow): PlayerStatsPayload {
  return {
    deaths: {
      byTeamkills: Number(row.deaths_by_teamkills),
      total: Number(row.deaths_total),
    },
    kills: Number(row.kills),
    replayCount: Number(row.replay_count),
    teamkills: Number(row.teamkills),
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
