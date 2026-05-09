/* eslint-disable new-cap, unicorn/no-null */
import { Type, type Static } from "@sinclair/typebox";

import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404;

export interface PublicStatsReadModel {
  getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null>;
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
  listPlayers(
    filters: PlayerListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>>;
}

export interface PublicStatsRouteOptions {
  readModel: PublicStatsReadModel;
}

export interface OverviewFilters {
  rotationId?: string;
}

export interface RotationFilters {
  rotationId?: string;
}

export interface PlayerListFilters extends RotationFilters {
  search?: string;
}

export interface StatsOverview {
  filters: {
    rotationId: string | null;
  };
  totals: {
    bountyPlayers: number;
    commanderSides: number;
    parsedReplays: number;
    players: number;
    playerStatRows: number;
    replays: number;
    squads: number;
    squadStatRows: number;
  };
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> extends PageQuery {
  items: T[];
  total: number;
}

export interface PlayerStatsPayload {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  kills: number;
  replayCount: number;
  teamkills: number;
}

export interface PlayerSummary {
  displayName: string;
  id: string;
  rotationId: string | null;
  stats: PlayerStatsPayload;
}

export interface PlayerProfile extends PlayerSummary {
  aliases: string[];
  steamIds: string[];
}

export const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Integer({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(
    Type.Integer({ default: 25, maximum: 100, minimum: 1 }),
  ),
});

export function paginated<T extends ReturnType<typeof Type.Object>>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
  });
}

const UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) }),
  RotationQuery = Type.Object({
    rotationId: Type.Optional(Type.String({ format: "uuid" })),
  }),
  PlayerListQuery = Type.Intersect([
    PaginationQuery,
    RotationQuery,
    Type.Object({
      search: Type.Optional(Type.String()),
    }),
  ]),
  PlayerDetailQuery = RotationQuery,
  PlayerStatsResponse = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    kills: Type.Number(),
    replayCount: Type.Number(),
    teamkills: Type.Number(),
  }),
  PlayerSummaryResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    stats: PlayerStatsResponse,
  }),
  PlayerProfileResponse = Type.Intersect([
    PlayerSummaryResponse,
    Type.Object({
      aliases: Type.Array(Type.String()),
      steamIds: Type.Array(Type.String()),
    }),
  ]),
  PlayerListResponse = paginated(PlayerSummaryResponse),
  OverviewResponse = Type.Object({
    filters: Type.Object({
      rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    }),
    totals: Type.Object({
      bountyPlayers: Type.Number(),
      commanderSides: Type.Number(),
      parsedReplays: Type.Number(),
      players: Type.Number(),
      playerStatRows: Type.Number(),
      replays: Type.Number(),
      squads: Type.Number(),
      squadStatRows: Type.Number(),
    }),
  }),
  NotFoundResponse = Type.Object({ message: Type.String() });

type UuidParametersType = Static<typeof UuidParameters>;
type PlayerDetailQueryType = Static<typeof PlayerDetailQuery>;
type PlayerListQueryType = Static<typeof PlayerListQuery>;
type OverviewQueryType = Static<typeof RotationQuery>;

export async function registerPublicStatsRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): Promise<void> {
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

export function createEmptyPublicStatsReadModel(): PublicStatsReadModel {
  return {
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
    listPlayers: (_filters, query) => Promise.resolve(emptyPage(query)),
  };
}

export function page(query: { page?: number; pageSize?: number }): PageQuery {
  return {
    page: Number(query.page),
    pageSize: Number(query.pageSize),
  };
}

function overviewFilters(query: OverviewQueryType): OverviewFilters {
  return query.rotationId === undefined ? {} : { rotationId: query.rotationId };
}

function rotationFilters(query: RotationFilters): RotationFilters {
  return query.rotationId === undefined ? {} : { rotationId: query.rotationId };
}

function playerListFilters(query: PlayerListQueryType): PlayerListFilters {
  return {
    ...rotationFilters(query),
    ...(query.search === undefined ? {} : { search: query.search }),
  };
}

function emptyPage<T>(query: PageQuery): PaginatedResult<T> {
  return {
    items: [],
    page: query.page,
    pageSize: query.pageSize,
    total: 0,
  };
}
