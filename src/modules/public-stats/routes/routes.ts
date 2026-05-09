/* eslint-disable unicorn/no-null */
import {
  NotFoundResponse,
  OverviewResponse,
  PlayerDetailQuery,
  PlayerListQuery,
  PlayerListResponse,
  PlayerProfileResponse,
  RotationQuery,
  SquadDetailQuery,
  SquadListQuery,
  SquadListResponse,
  SquadProfileResponse,
  UuidParameters,
  type OverviewQueryType,
  type PlayerDetailQueryType,
  type PlayerListQueryType,
  type SquadDetailQueryType,
  type SquadListQueryType,
  type UuidParametersType,
} from "./schemas.js";

import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404;

export interface PublicStatsReadModel {
  getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null>;
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
  getSquad(id: string, filters: RotationFilters): Promise<SquadProfile | null>;
  listPlayers(
    filters: PlayerListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>>;
  listSquads(
    filters: SquadListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<SquadSummary>>;
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

export interface SquadListFilters extends RotationFilters {
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

export interface SquadStatsPayload {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  kills: number;
  playerCount: number;
  replayCount: number;
  teamkills: number;
}

export interface SquadSummary {
  id: string;
  name: string;
  rotationId: string | null;
  stats: SquadStatsPayload;
}

export interface SquadProfile extends SquadSummary {
  players: {
    displayName: string;
    id: string;
  }[];
}

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
    getSquad: () => Promise.resolve(null),
    listPlayers: (_filters, query) => Promise.resolve(emptyPage(query)),
    listSquads: (_filters, query) => Promise.resolve(emptyPage(query)),
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

function squadListFilters(query: SquadListQueryType): SquadListFilters {
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
