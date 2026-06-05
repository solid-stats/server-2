import {
  leaderboardFilters,
  overviewFilters,
  page,
  playerListFilters,
  rotationFilters,
  squadListFilters,
} from "./filters.js";
import { BadCursorError } from "./pagination/errors.js";
import {
  BOUNTY_SORT,
  BOUNTY_SORT_DEFAULT,
  PLAYER_SORT,
  PLAYER_SORT_DEFAULT,
  SQUAD_SORT,
  SQUAD_SORT_DEFAULT,
} from "./pagination/sort.js";
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

import type { PublicStatsRouteOptions } from "./models.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export { page } from "./filters.js";
export { createEmptyPublicStatsReadModel } from "./empty-read-model.js";
export type * from "./models.js";

const NOT_FOUND = 404,
  BAD_REQUEST = 400;

export async function registerPublicStatsRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): Promise<void> {
  // Encapsulate the public-stats routes in a child context so the cursor
  // mixed-param guard and the BadCursorError -> 400 mapping apply ONLY here and
  // never leak onto unrelated routes (auth, requests, ingest, ...).
  await app.register((scope) => {
    scope.addHook("preValidation", rejectLegacyPaginationParameters);
    scope.setErrorHandler(mapPublicStatsError);
    registerOverviewRoutes(scope, options);
    registerRotationRoutes(scope, options);
    registerPlayerRoutes(scope, options);
    registerSquadRoutes(scope, options);
    registerAggregateIndexRoutes(scope, options);
    return Promise.resolve();
  });
}

/**
 * Reject the removed offset-pagination contract. A `page`/`pageSize` param is no
 * longer accepted at all (clean break — `web` is a new consumer), and supplying
 * both a legacy `page` and a `cursor` is explicitly a 400 rather than silently
 * resolved (14-RESEARCH Code Example 1 / Pitfall 5).
 */
async function rejectLegacyPaginationParameters(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as Record<string, unknown>;
  if ("cursor" in query && "page" in query) {
    await reply
      .code(BAD_REQUEST)
      .send({ message: "Provide either 'cursor' or 'page', not both." });
    return;
  }
  if ("page" in query || "pageSize" in query) {
    await reply
      .code(BAD_REQUEST)
      .send({ message: "'page'/'pageSize' are not supported; use 'cursor'." });
  }
}

/**
 * Map a {@link BadCursorError} (malformed/tampered cursor, unknown sort field,
 * cursor sort/order drift) to a 400. The thrown reason is a fixed server string
 * that never echoes the cursor input, so no Steam64 can leak via the error body.
 */
function mapPublicStatsError(
  error: Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof BadCursorError) {
    return reply.code(BAD_REQUEST).send({ message: error.message });
  }
  throw error;
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
        page(request.query, PLAYER_SORT, PLAYER_SORT_DEFAULT),
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
        page(request.query, SQUAD_SORT, SQUAD_SORT_DEFAULT),
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
        page(request.query, BOUNTY_SORT, BOUNTY_SORT_DEFAULT),
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
