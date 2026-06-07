/* eslint-disable unicorn/no-null */
import { emptyPage } from "./filters.js";

import type {
  PaginatedResult,
  PublicLeaderboards,
  PublicStatsReadModel,
  ReplayEvent,
  ReplaySummary,
} from "./models.js";

/**
 * A read model that returns the empty cursor shape for every list surface. Used
 * as the default injected model when no PostgreSQL-backed model is provided
 * (tests, boot-without-DB). Every list/leaderboard surface returns
 * `{ items: [], nextCursor: null, hasMore: false }` — never the removed
 * page/pageSize/total shape.
 */
export function createEmptyPublicStatsReadModel(): PublicStatsReadModel {
  return {
    getLeaderboards: (filters) =>
      Promise.resolve(emptyLeaderboards(filters.rotationId ?? null)),
    getOverview: (filters) =>
      Promise.resolve({
        filters: { rotationId: filters.rotationId ?? null },
        totals: {
          bountyPlayers: 0,
          commanderSides: 0,
          parsedReplays: 0,
          players: 0,
          playerStatRows: 0,
          replays: 0,
          squads: 0,
          squadStatRows: 0,
        },
      }),
    getPlayer: () => Promise.resolve(null),
    // Phase 16: history sub-resource stubs (Pitfall 6 — must match interface).
    getPlayerMembershipHistory: () => Promise.resolve(null),
    getPlayerNameHistory: () => Promise.resolve(null),
    getPlayerRelationships: () => Promise.resolve(null),
    getPlayerVehicles: () => Promise.resolve(null),
    getPlayerWeapons: () => Promise.resolve(null),
    getPlayerWeekly: () => Promise.resolve(null),
    // Phase 16: rotation detail stub.
    getRotation: () => Promise.resolve(null),
    getSquad: () => Promise.resolve(null),
    getSquadRelationships: () => Promise.resolve(null),
    // Phase 16: squad membership history stub.
    getSquadMembershipHistory: () => Promise.resolve(null),
    getSquadWeapons: () => Promise.resolve(null),
    getSquadWeekly: () => Promise.resolve(null),
    listBounty: () => Promise.resolve(emptyPage()),
    listCommanderSides: () => Promise.resolve([]),
    listPlayers: () => Promise.resolve(emptyPage()),
    // Phase 17: replay list + detail + events stubs.
    listReplays: (): Promise<PaginatedResult<ReplaySummary>> =>
      Promise.resolve(emptyPage()),
    getReplay: () => Promise.resolve(null),
    getReplayEvents: (): Promise<PaginatedResult<ReplayEvent> | null> =>
      Promise.resolve(null),
    // Phase 17 (REPLAY-04): sitemap enumerator stubs.
    countReplaySitemapPages: () => Promise.resolve(0),
    listReplaySitemapPage: () => Promise.resolve([]),
    listRotations: () => Promise.resolve([]),
    listSquads: () => Promise.resolve(emptyPage()),
  };
}

function emptyLeaderboards(rotationId: string | null): PublicLeaderboards {
  return {
    bounty: emptySurface(),
    playersByKills: emptySurface(),
    rotationId,
    squadsByKills: emptySurface(),
  };
}

function emptySurface<T>(): PaginatedResult<T> {
  return { hasMore: false, items: [], nextCursor: null };
}
