/* eslint-disable unicorn/no-null */
import { emptyPage } from "./filters.js";

import type {
  PaginatedResult,
  PublicLeaderboards,
  PublicStatsReadModel,
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
    getPlayerRelationships: () => Promise.resolve(null),
    getPlayerVehicles: () => Promise.resolve(null),
    getPlayerWeapons: () => Promise.resolve(null),
    getPlayerWeekly: () => Promise.resolve(null),
    getSquad: () => Promise.resolve(null),
    listBounty: () => Promise.resolve(emptyPage()),
    listCommanderSides: () => Promise.resolve([]),
    listPlayers: () => Promise.resolve(emptyPage()),
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
