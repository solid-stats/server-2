/* eslint-disable new-cap, unicorn/no-null */
import { Type, type Static } from "@sinclair/typebox";

import type { FastifyInstance } from "fastify";

export interface PublicStatsReadModel {
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
}

export interface PublicStatsRouteOptions {
  readModel: PublicStatsReadModel;
}

export interface OverviewFilters {
  rotationId?: string;
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

const OverviewQuery = Type.Object({
    rotationId: Type.Optional(Type.String({ format: "uuid" })),
  }),
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
  });

type OverviewQueryType = Static<typeof OverviewQuery>;

export async function registerPublicStatsRoutes(
  app: FastifyInstance,
  options: PublicStatsRouteOptions,
): Promise<void> {
  app.get<{ Querystring: OverviewQueryType }>(
    "/stats/overview",
    {
      schema: {
        querystring: OverviewQuery,
        response: { 200: OverviewResponse },
        tags: ["public-stats"],
      },
    },
    async (request) =>
      options.readModel.getOverview(overviewFilters(request.query)),
  );
}

export function createEmptyPublicStatsReadModel(): PublicStatsReadModel {
  return {
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
