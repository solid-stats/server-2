/* eslint-disable unicorn/no-null */
import {
  emptyPage,
  leaderboardFilters,
  overviewFilters,
  page,
  playerListFilters,
  rotationFilters,
  squadListFilters,
} from "./filters.js";
import {
  BountyListQuery,
  BountyListResponse,
  CommanderSideResponse,
  LeaderboardQuery,
  LeaderboardsResponse,
  NotFoundResponse,
  OverviewResponse,
  PlayerDetailQuery,
  PlayerListQuery,
  PlayerListResponse,
  PlayerProfileResponse,
  RotationQuery,
  RotationSummaryResponse,
  SquadDetailQuery,
  SquadListQuery,
  SquadListResponse,
  SquadProfileResponse,
  UuidParameters,
  type BountyListQueryType,
  type LeaderboardQueryType,
  type OverviewQueryType,
  type PlayerDetailQueryType,
  type PlayerListQueryType,
  type SquadDetailQueryType,
  type SquadListQueryType,
  type UuidParametersType,
} from "./schemas.js";

import type {
  PublicLeaderboards,
  PublicStatsReadModel,
  PublicStatsRouteOptions,
} from "./models.js";
import type { FastifyInstance } from "fastify";

export { page } from "./filters.js";
export type * from "./models.js";

const NOT_FOUND = 404;

export async function registerPublicStatsRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): Promise<void> {
  registerOverviewRoutes(app, options);
  registerRotationRoutes(app, options);
  registerPlayerRoutes(app, options);
  registerSquadRoutes(app, options);
  registerAggregateIndexRoutes(app, options);
}

export function createEmptyPublicStatsReadModel(): PublicStatsReadModel {
  return {
    getLeaderboards: (filters) =>
      Promise.resolve(emptyLeaderboards(filters.rotationId ?? null)),
    getPlayer: () => Promise.resolve(null),
    getOverview: (filters) =>
      Promise.resolve({
        filters: {
          rotationId: filters.rotationId ?? null,
        },
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
    getSquad: () => Promise.resolve(null),
    listBounty: (_filters, query) => Promise.resolve(emptyPage(query)),
    listCommanderSides: () => Promise.resolve([]),
    listPlayers: (_filters, query) => Promise.resolve(emptyPage(query)),
    listRotations: () => Promise.resolve([]),
    listSquads: (_filters, query) => Promise.resolve(emptyPage(query)),
  };
}

function registerOverviewRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: OverviewQueryType }>(
    "/stats/overview",
    {
      schema: {
        querystring: RotationQuery,
        response: { 200: OverviewResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.getOverview(overviewFilters(request.query)),
  );
}

function registerRotationRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get(
    "/stats/rotations",
    {
      schema: {
        response: { 200: { type: "array", items: RotationSummaryResponse } },
        tags: ["public-stats"],
      },
    },
    async () => options.readModel.listRotations(),
  );
}

function registerPlayerRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: PlayerListQueryType }>(
    "/stats/players",
    {
      schema: {
        querystring: PlayerListQuery,
        response: { 200: PlayerListResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listPlayers(
        playerListFilters(request.query),
        page(request.query),
      ),
  );

  app.get<{
    Params: UuidParametersType;
    Querystring: PlayerDetailQueryType;
  }>(
    "/stats/players/:id",
    {
      schema: {
        params: UuidParameters,
        querystring: PlayerDetailQuery,
        response: { 200: PlayerProfileResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayer(
        request.params.id,
        rotationFilters(request.query),
      );
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );
}

function registerSquadRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: SquadListQueryType }>(
    "/stats/squads",
    {
      schema: {
        querystring: SquadListQuery,
        response: { 200: SquadListResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listSquads(
        squadListFilters(request.query),
        page(request.query),
      ),
  );

  app.get<{
    Params: UuidParametersType;
    Querystring: SquadDetailQueryType;
  }>(
    "/stats/squads/:id",
    {
      schema: {
        params: UuidParameters,
        querystring: SquadDetailQuery,
        response: { 200: SquadProfileResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getSquad(
        request.params.id,
        rotationFilters(request.query),
      );
      return item ?? reply.code(NOT_FOUND).send({ message: "squad not found" });
    },
  );
}

function registerAggregateIndexRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: OverviewQueryType }>(
    "/stats/commander-sides",
    {
      schema: {
        querystring: RotationQuery,
        response: { 200: { type: "array", items: CommanderSideResponse } },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listCommanderSides(rotationFilters(request.query)),
  );

  app.get<{ Querystring: BountyListQueryType }>(
    "/stats/bounty",
    {
      schema: {
        querystring: BountyListQuery,
        response: { 200: BountyListResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listBounty(
        rotationFilters(request.query),
        page(request.query),
      ),
  );

  app.get<{ Querystring: LeaderboardQueryType }>(
    "/stats/leaderboards",
    {
      schema: {
        querystring: LeaderboardQuery,
        response: { 200: LeaderboardsResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.getLeaderboards(leaderboardFilters(request.query)),
  );
}

function emptyLeaderboards(rotationId: string | null): PublicLeaderboards {
  return {
    bounty: [],
    playersByKills: [],
    rotationId,
    squadsByKills: [],
  };
}
