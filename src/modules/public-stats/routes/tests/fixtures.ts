/* eslint-disable @typescript-eslint/no-unused-vars, class-methods-use-this, max-lines, unicorn/no-null */
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
  SquadSummary,
  SquadWeaponsPayload,
  SquadWeeklyPayload,
  StatsOverview,
} from "../routes.js";

function singlePage<T>(item: T): PaginatedResult<T> {
  return { hasMore: false, items: [item], nextCursor: null };
}

export const playerId = "00000000-0000-4000-8000-000000000502",
  rotationId = "00000000-0000-4000-8000-000000000501",
  squadId = "00000000-0000-4000-8000-000000000503",
  replayId = "00000000-0000-4000-8000-000000000801";

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

  public lastBountyPage: PageQuery | undefined;

  public lastPlayerListPage: PageQuery | undefined;

  public lastSquadListPage: PageQuery | undefined;

  public getLeaderboards(
    filters: LeaderboardFilters,
  ): Promise<PublicLeaderboards> {
    this.lastLeaderboardFilters = filters;
    return Promise.resolve({
      bounty: singlePage(bountySummary(filters)),
      playersByKills: singlePage(playerProfile(filters)),
      rotationId: filters.rotationId ?? null,
      squadsByKills: singlePage(squadProfile(filters)),
    });
  }

  public getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null> {
    this.lastPlayerFilters = filters;
    return Promise.resolve(id === playerId ? playerProfile(filters) : null);
  }

  public getPlayerRelationships(
    id: string,
  ): Promise<PlayerRelationshipsPayload | null> {
    return Promise.resolve(
      id === playerId
        ? {
            killed: [],
            killers: [],
            provenance: { lastUpdatedAt: null },
            teamkilled: [],
            teamkillers: [],
          }
        : null,
    );
  }

  public getPlayerVehicles(id: string): Promise<PlayerVehiclesPayload | null> {
    return Promise.resolve(
      id === playerId
        ? {
            killsFromVehicle: 0,
            killsFromVehicleCoef: 0,
            provenance: { lastUpdatedAt: null },
            vehicleKills: 0,
            vehicles: [],
          }
        : null,
    );
  }

  public getPlayerWeapons(id: string): Promise<PlayerWeaponsPayload | null> {
    return Promise.resolve(
      id === playerId
        ? { firearms: [], provenance: { lastUpdatedAt: null }, vehicles: [] }
        : null,
    );
  }

  public getPlayerWeekly(id: string): Promise<PlayerWeeklyPayload | null> {
    return Promise.resolve(
      id === playerId
        ? { provenance: { lastUpdatedAt: null }, weeks: [] }
        : null,
    );
  }

  // Phase 16: history/rotation stubs for the fake read model.
  public getPlayerNameHistory(_id: string): Promise<NameHistoryPayload | null> {
    return Promise.resolve(null);
  }

  public getPlayerMembershipHistory(
    _id: string,
  ): Promise<PlayerMembershipHistoryPayload | null> {
    return Promise.resolve(null);
  }

  public getRotation(_id: string): Promise<RotationDetail | null> {
    return Promise.resolve(null);
  }

  public getSquadMembershipHistory(
    _id: string,
  ): Promise<SquadMembershipHistoryPayload | null> {
    return Promise.resolve(null);
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

  public getSquadRelationships(
    id: string,
  ): Promise<SquadRelationshipsPayload | null> {
    return Promise.resolve(
      id === squadId
        ? {
            killed: [],
            killers: [],
            provenance: { lastUpdatedAt: null },
            teamkilled: [],
            teamkillers: [],
          }
        : null,
    );
  }

  public getSquadWeapons(id: string): Promise<SquadWeaponsPayload | null> {
    return Promise.resolve(
      id === squadId
        ? { firearms: [], provenance: { lastUpdatedAt: null }, vehicles: [] }
        : null,
    );
  }

  public getSquadWeekly(id: string): Promise<SquadWeeklyPayload | null> {
    return Promise.resolve(
      id === squadId
        ? { provenance: { lastUpdatedAt: null }, weeks: [] }
        : null,
    );
  }

  public listBounty(
    filters: RotationFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<BountySummary>> {
    this.lastBountyFilters = filters;
    this.lastBountyPage = query;
    return Promise.resolve(singlePage(bountySummary(filters)));
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
    this.lastPlayerListPage = query;
    return Promise.resolve(singlePage(playerProfile(filters)));
  }

  public listSquads(
    filters: SquadListFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<SquadSummary>> {
    this.lastSquadListFilters = filters;
    this.lastSquadListPage = query;
    return Promise.resolve(singlePage(squadProfile(filters)));
  }

  public listRotations(): Promise<RotationSummary[]> {
    this.listedRotations = true;
    return Promise.resolve([rotationSummary()]);
  }

  // Phase 17: replay list + detail + events stubs.

  public listReplays(
    _filters: ReplayListFilters,
    _query: PageQuery,
  ): Promise<PaginatedResult<ReplaySummary>> {
    return Promise.resolve({
      hasMore: false,
      items: [replaySummary()],
      nextCursor: null,
    });
  }

  public getReplay(id: string): Promise<ReplayDetail | null> {
    return Promise.resolve(id === replayId ? replayDetail() : null);
  }

  public getReplayEvents(
    id: string,
    _query: PageQuery,
  ): Promise<PaginatedResult<ReplayEvent> | null> {
    if (id !== replayId) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      hasMore: false,
      items: [replayEvent()],
      nextCursor: null,
    });
  }

  // Phase 17 (REPLAY-04): sitemap enumerator stubs.
  public countReplaySitemapPages(): Promise<number> {
    return Promise.resolve(0);
  }

  public listReplaySitemapPage(_page: number): Promise<string[]> {
    return Promise.resolve([]);
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
    // Phase 16: slug field (stub — Plan 04 wires real value).
    provenance: { lastUpdatedAt: null },
    rotationId: filters.rotationId ?? null,
    slug: "alpha",
    stats: {
      deaths: {
        byTeamkills: 0,
        total: 1,
      },
      kdRatio: 3,
      kills: 3,
      replayCount: 2,
      teamkills: 0,
      totalPlayedGames: 2,
      totalScore: 3,
    },
    steamIds: ["steam-a"],
  };
}

export function rotationSummary(): RotationSummary {
  return {
    endsAt: null,
    id: rotationId,
    name: "Rotation 1",
    // Phase 16: slug field (stub — Plan 04 wires real value).
    slug: "rotation-1",
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
    // Phase 16: slug + provenance fields (stubs — Plan 04 wires real values).
    provenance: { lastUpdatedAt: null },
    rotationId: filters.rotationId ?? null,
    slug: "alpha-squad",
    stats: {
      deaths: {
        byTeamkills: 1,
        total: 2,
      },
      kdRatio: 2.5,
      kills: 5,
      playerCount: 1,
      replayCount: 3,
      teamkills: 1,
      totalPlayedGames: 3,
      totalScore: 4,
    },
  };
}

// Phase 17: replay surface builder fixtures.

export function replaySummary(): ReplaySummary {
  return {
    id: replayId,
    replayTimestamp: "2026-05-02T00:00:00.000Z",
    rotationId,
    slug: "solidgames-replay-1",
    sourceReplayId: "replay-1",
    sourceSystem: "solidgames",
    status: "parsed",
  };
}

export function replayDetail(): ReplayDetail {
  return {
    id: replayId,
    map: "Altis",
    participants: [],
    provenance: { lastUpdatedAt: null },
    replayTimestamp: "2026-05-02T00:00:00.000Z",
    rotation: { id: rotationId, name: "Rotation 1", slug: "rotation-1" },
    sides: [],
    slug: "solidgames-replay-1",
  };
}

export function replayEvent(): ReplayEvent {
  return {
    actor: null,
    eventType: "kill",
    id: "00000000-0000-4000-8000-000000000901",
    occurredAt: "2026-05-02T12:00:00.000Z",
    payload: { weapon: "Rifle" },
  };
}
