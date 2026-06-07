/* eslint-disable max-lines */
import {
  commanderSideFilters,
  leaderboardFilters,
  overviewFilters,
  page,
  playerListFilters,
  replayListFilters,
  rotationFilters,
  squadListFilters,
} from "./filters.js";
import { BadCursorError } from "./pagination/errors.js";
import {
  BOUNTY_SORT,
  BOUNTY_SORT_DEFAULT,
  EVENT_SORT,
  EVENT_SORT_DEFAULT,
  PLAYER_SORT,
  PLAYER_SORT_DEFAULT,
  REPLAY_SORT,
  REPLAY_SORT_DEFAULT,
  SQUAD_SORT,
  SQUAD_SORT_DEFAULT,
} from "./pagination/sort.js";
import {
  BountyListQuery,
  BountyListResponse,
  CommanderSideQuery,
  CommanderSideResponse,
  LeaderboardQuery,
  LeaderboardsResponse,
  NameHistoryResponse,
  NotFoundResponse,
  OverviewResponse,
  PlayerDetailQuery,
  PlayerListQuery,
  PlayerListResponse,
  PlayerMembershipHistoryResponse,
  PlayerProfileResponse,
  PlayerRelationshipsResponse,
  PlayerVehiclesResponse,
  PlayerWeaponsResponse,
  PlayerWeeklyResponse,
  ReplayDetailResponse,
  ReplayEventsQuery,
  ReplayEventsResponse,
  ReplayListQuery,
  ReplayListResponse,
  RotationDetailResponse,
  RotationQuery,
  RotationSummaryResponse,
  SlugOrUuidParameters,
  SquadDetailQuery,
  SquadListQuery,
  SquadListResponse,
  SquadMembershipHistoryResponse,
  SquadProfileResponse,
  SquadRelationshipsResponse,
  SquadWeaponsResponse,
  SquadWeeklyResponse,
  type BountyListQueryType,
  type CommanderSideQueryType,
  type LeaderboardQueryType,
  type OverviewQueryType,
  type PlayerDetailQueryType,
  type PlayerListQueryType,
  type ReplayEventsQueryType,
  type ReplayListQueryType,
  type SlugOrUuidParametersType,
  type SquadDetailQueryType,
  type SquadListQueryType,
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
    registerReplayRoutes(scope, options);
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

  // Phase 16: rotation detail route (API-01 — slug-or-uuid resolved by repository).
  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/rotations/:id",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: RotationDetailResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getRotation(request.params.id);
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "rotation not found" })
      );
    },
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
    Params: SlugOrUuidParametersType;
    Querystring: PlayerDetailQueryType;
  }>(
    "/stats/players/:id",
    {
      schema: {
        params: SlugOrUuidParameters,
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

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/weapons",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: PlayerWeaponsResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerWeapons(request.params.id);
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/vehicles",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: PlayerVehiclesResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerVehicles(request.params.id);
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/relationships",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: PlayerRelationshipsResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerRelationships(
        request.params.id,
      );
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/weekly",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: PlayerWeeklyResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerWeekly(request.params.id);
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );

  registerPlayerHistoryRoutes(app, options);
}

// Phase 16: history sub-resource routes (HIST-01) — extracted to keep registerPlayerRoutes within
// the max-lines-per-function limit.
function registerPlayerHistoryRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/name-history",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: NameHistoryResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerNameHistory(
        request.params.id,
      );
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "player not found" })
      );
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/players/:id/membership-history",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: {
          200: PlayerMembershipHistoryResponse,
          404: NotFoundResponse,
        },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getPlayerMembershipHistory(
        request.params.id,
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
    Params: SlugOrUuidParametersType;
    Querystring: SquadDetailQueryType;
  }>(
    "/stats/squads/:id",
    {
      schema: {
        params: SlugOrUuidParameters,
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

  // PARITY-06: Squad sub-resource surfaces — member-level aggregations (15-CONTEXT Q3).
  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/squads/:id/weapons",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: SquadWeaponsResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getSquadWeapons(request.params.id);
      return item ?? reply.code(NOT_FOUND).send({ message: "squad not found" });
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/squads/:id/relationships",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: SquadRelationshipsResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getSquadRelationships(
        request.params.id,
      );
      return item ?? reply.code(NOT_FOUND).send({ message: "squad not found" });
    },
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/squads/:id/weekly",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: SquadWeeklyResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getSquadWeekly(request.params.id);
      return item ?? reply.code(NOT_FOUND).send({ message: "squad not found" });
    },
  );

  // Phase 16: history sub-resource route (HIST-02).
  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/squads/:id/membership-history",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: {
          200: SquadMembershipHistoryResponse,
          404: NotFoundResponse,
        },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getSquadMembershipHistory(
        request.params.id,
      );
      return item ?? reply.code(NOT_FOUND).send({ message: "squad not found" });
    },
  );
}

// Phase 17: replay surface routes (REPLAY-01/02/03).
// Registered inside the existing child scope so all three routes inherit the
// rejectLegacyPaginationParameters preValidation (mixed page+cursor → 400) and
// the BadCursorError→400 error handler from the parent registerPublicStatsRoutes.
function registerReplayRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: ReplayListQueryType }>(
    "/stats/replays",
    {
      schema: {
        querystring: ReplayListQuery,
        response: { 200: ReplayListResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listReplays(
        replayListFilters(request.query),
        page(request.query, REPLAY_SORT, REPLAY_SORT_DEFAULT),
      ),
  );

  app.get<{ Params: SlugOrUuidParametersType }>(
    "/stats/replays/:id",
    {
      schema: {
        params: SlugOrUuidParameters,
        response: { 200: ReplayDetailResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getReplay(request.params.id);
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "replay not found" })
      );
    },
  );

  app.get<{
    Params: SlugOrUuidParametersType;
    Querystring: ReplayEventsQueryType;
  }>(
    "/stats/replays/:id/events",
    {
      schema: {
        params: SlugOrUuidParameters,
        querystring: ReplayEventsQuery,
        response: { 200: ReplayEventsResponse, 404: NotFoundResponse },
        tags: ["public-stats"],
      },
    },
    async (request, reply) => {
      // Events paginate in ascending time order (NULLS FIRST) — ReplayEventsQuery
      // defaults order to "asc" so the keyset matches (occurred_at ASC NULLS FIRST, id ASC).
      const eventsPage = page(request.query, EVENT_SORT, EVENT_SORT_DEFAULT);
      const item = await options.readModel.getReplayEvents(
        request.params.id,
        eventsPage,
      );
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "replay not found" })
      );
    },
  );
}

function registerAggregateIndexRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): void {
  app.get<{ Querystring: CommanderSideQueryType }>(
    "/stats/commander-sides",
    {
      schema: {
        querystring: CommanderSideQuery,
        response: { 200: { type: "array", items: CommanderSideResponse } },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.listCommanderSides(commanderSideFilters(request.query)),
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
