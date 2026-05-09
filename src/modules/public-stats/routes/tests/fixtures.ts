/* eslint-disable unicorn/no-null */
import type {
  BountySummary,
  CommanderSideSummary,
  LeaderboardFilters,
  OverviewFilters,
  PageQuery,
  PaginatedResult,
  PlayerListFilters,
  PlayerProfile,
  PlayerSummary,
  PublicLeaderboards,
  PublicStatsReadModel,
  RotationFilters,
  RotationSummary,
  SquadListFilters,
  SquadProfile,
  SquadSummary,
  StatsOverview,
} from "../routes.js";

export const playerId = "00000000-0000-4000-8000-000000000502",
  rotationId = "00000000-0000-4000-8000-000000000501",
  squadId = "00000000-0000-4000-8000-000000000503";

export class FakePublicStatsReadModel implements PublicStatsReadModel {
  public lastBountyFilters: RotationFilters | undefined;

  public lastCommanderFilters: RotationFilters | undefined;

  public lastFilters: OverviewFilters | undefined;

  public lastLeaderboardFilters: LeaderboardFilters | undefined;

  public lastPlayerFilters: RotationFilters | undefined;

  public lastPlayerListFilters: PlayerListFilters | undefined;

  public listedRotations = false;

  public lastSquadFilters: RotationFilters | undefined;

  public lastSquadListFilters: SquadListFilters | undefined;

  public getLeaderboards(
    filters: LeaderboardFilters,
  ): Promise<PublicLeaderboards> {
    this.lastLeaderboardFilters = filters;
    return Promise.resolve({
      bounty: [bountySummary(filters)],
      playersByKills: [playerProfile(filters)],
      rotationId: filters.rotationId ?? null,
      squadsByKills: [squadProfile(filters)],
    });
  }

  public getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null> {
    this.lastPlayerFilters = filters;
    return Promise.resolve(id === playerId ? playerProfile(filters) : null);
  }

  public getOverview(filters: OverviewFilters): Promise<StatsOverview> {
    this.lastFilters = filters;
    return Promise.resolve({
      filters: {
        rotationId: filters.rotationId ?? null,
      },
      totals: {
        bountyPlayers: 1,
        commanderSides: 1,
        parsedReplays: 3,
        players: 2,
        playerStatRows: 2,
        replays: 3,
        squads: 1,
        squadStatRows: 1,
      },
    });
  }

  public getSquad(
    id: string,
    filters: RotationFilters,
  ): Promise<SquadProfile | null> {
    this.lastSquadFilters = filters;
    return Promise.resolve(id === squadId ? squadProfile(filters) : null);
  }

  public listBounty(
    filters: RotationFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<BountySummary>> {
    this.lastBountyFilters = filters;
    return Promise.resolve({
      items: [bountySummary(filters)],
      page: query.page,
      pageSize: query.pageSize,
      total: 1,
    });
  }

  public listCommanderSides(
    filters: RotationFilters,
  ): Promise<CommanderSideSummary[]> {
    this.lastCommanderFilters = filters;
    return Promise.resolve([commanderSideSummary(filters)]);
  }

  public listPlayers(
    filters: PlayerListFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>> {
    this.lastPlayerListFilters = filters;
    return Promise.resolve({
      items: [playerProfile(filters)],
      page: query.page,
      pageSize: query.pageSize,
      total: 1,
    });
  }

  public listSquads(
    filters: SquadListFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<SquadSummary>> {
    this.lastSquadListFilters = filters;
    return Promise.resolve({
      items: [squadProfile(filters)],
      page: query.page,
      pageSize: query.pageSize,
      total: 1,
    });
  }

  public listRotations(): Promise<RotationSummary[]> {
    this.listedRotations = true;
    return Promise.resolve([rotationSummary()]);
  }
}

export function bountySummary(filters: RotationFilters): BountySummary {
  return {
    player: {
      displayName: "Alpha",
      id: playerId,
    },
    points: 7.5,
    rotationId: filters.rotationId ?? rotationId,
  };
}

export function commanderSideSummary(
  filters: RotationFilters,
): CommanderSideSummary {
  return {
    knownLosses: 1,
    knownWins: 2,
    player: {
      displayName: "Alpha",
      id: playerId,
    },
    rotationId: filters.rotationId ?? rotationId,
    side: "west",
    unknownOutcomes: 1,
  };
}

export function playerProfile(filters: RotationFilters): PlayerProfile {
  return {
    aliases: ["Alpha"],
    displayName: "Alpha",
    id: playerId,
    rotationId: filters.rotationId ?? null,
    stats: {
      deaths: {
        byTeamkills: 0,
        total: 1,
      },
      kills: 3,
      replayCount: 2,
      teamkills: 0,
    },
    steamIds: ["steam-a"],
  };
}

export function rotationSummary(): RotationSummary {
  return {
    endsAt: null,
    id: rotationId,
    name: "Rotation 1",
    startsAt: "2026-05-01T00:00:00.000Z",
  };
}

export function squadProfile(filters: RotationFilters): SquadProfile {
  return {
    id: squadId,
    name: "Alpha Squad",
    players: [
      {
        displayName: "Alpha",
        id: playerId,
      },
    ],
    rotationId: filters.rotationId ?? null,
    stats: {
      deaths: {
        byTeamkills: 1,
        total: 2,
      },
      kills: 5,
      playerCount: 1,
      replayCount: 3,
      teamkills: 1,
    },
  };
}
