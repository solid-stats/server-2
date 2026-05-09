import type {
  LeaderboardFilters,
  OverviewFilters,
  PageQuery,
  PaginatedResult,
  PlayerListFilters,
  RotationFilters,
  SquadListFilters,
} from "./models.js";
import type {
  LeaderboardQueryType,
  OverviewQueryType,
  PlayerListQueryType,
  SquadListQueryType,
} from "./schemas.js";

export function page(query: { page?: number; pageSize?: number }): PageQuery {
  return {
    page: Number(query.page),
    pageSize: Number(query.pageSize),
  };
}

export function overviewFilters(query: OverviewQueryType): OverviewFilters {
  return query.rotationId === undefined ? {} : { rotationId: query.rotationId };
}

export function rotationFilters(query: RotationFilters): RotationFilters {
  return query.rotationId === undefined ? {} : { rotationId: query.rotationId };
}

export function playerListFilters(
  query: PlayerListQueryType,
): PlayerListFilters {
  return {
    ...rotationFilters(query),
    ...(query.search === undefined ? {} : { search: query.search }),
  };
}

export function squadListFilters(query: SquadListQueryType): SquadListFilters {
  return {
    ...rotationFilters(query),
    ...(query.search === undefined ? {} : { search: query.search }),
  };
}

export function leaderboardFilters(
  query: LeaderboardQueryType,
): LeaderboardFilters {
  return {
    ...rotationFilters(query),
    limit: Number(query.limit),
  };
}

export function emptyPage<T>(query: PageQuery): PaginatedResult<T> {
  return {
    items: [],
    page: query.page,
    pageSize: query.pageSize,
    total: 0,
  };
}
