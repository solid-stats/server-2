import { decodeCursor } from "./pagination/cursor.js";
import { BadCursorError } from "./pagination/errors.js";
import {
  BOUNTY_SORT,
  BOUNTY_SORT_DEFAULT,
  PLAYER_SORT,
  PLAYER_SORT_DEFAULT,
  resolveSort,
  SQUAD_SORT,
  SQUAD_SORT_DEFAULT,
  type SortDescriptor,
} from "./pagination/sort.js";

import type {
  LeaderboardFilters,
  OverviewFilters,
  PageCursorState,
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

type SortWhitelist = Readonly<Record<string, SortDescriptor>>;

interface DecodeAfterOptions {
  cursor: string | undefined;
  whitelist: SortWhitelist;
  sort: string;
  order: "asc" | "desc";
}

const DEFAULT_LIMIT = 25,
  /** Sort tuple length: a single sort value plus the id tie-breaker. */
  CURSOR_ARITY = 1;

interface PaginationInput {
  cursor?: string;
  limit?: number;
  order?: "asc" | "desc";
  sort?: string;
}

/**
 * Build a keyset {@link PageQuery} from a list query, resolving the requested
 * sort against the endpoint whitelist and decoding the opaque cursor when
 * present. Throws {@link BadCursorError} (mapped to 400) when the sort field is
 * not whitelisted, when the cursor is malformed/tampered, or when the cursor's
 * encoded sort/order disagrees with the request's sort/order (prevents resuming
 * a cursor under a different ordering — 14-RESEARCH Pitfall 3).
 */
export function page(
  query: PaginationInput,
  whitelist: SortWhitelist,
  defaultSort: string,
): PageQuery {
  const resolved = resolveSort(whitelist, query.sort, defaultSort),
    order = query.order ?? "desc",
    limit = query.limit ?? DEFAULT_LIMIT,
    after = decodeAfter({
      cursor: query.cursor,
      order,
      sort: resolved.field,
      whitelist,
    });
  return after === undefined
    ? { limit, order, sort: resolved.field }
    : { after, limit, order, sort: resolved.field };
}

function decodeAfter(options: DecodeAfterOptions): PageCursorState | undefined {
  const { cursor, order, sort, whitelist } = options;
  if (cursor === undefined) {
    return undefined;
  }
  const payload = decodeCursor(cursor, Object.keys(whitelist), CURSOR_ARITY),
    // eslint-disable-next-line unicorn/no-null -- a null sort value is a valid keyset boundary
    value = payload.values[0] ?? null;
  if (payload.sort !== sort || payload.order !== order) {
    throw new BadCursorError("cursor sort/order mismatch");
  }
  assertCursorValueType(whitelist[payload.sort], value);
  return { id: payload.id, value };
}

/**
 * Reject a tampered cursor whose value type does not match the resolved sort
 * field's SQL type. Without this guard a forged numeric-key cursor carrying a
 * string (`values: ["abc"]`) would reach the keyset predicate and bind
 * `'abc'::bigint`, producing a DB error → unhandled 500 instead of the
 * contractual fail-closed 400 (WR-04). A `null` value is always a legal keyset
 * boundary (NULLS-aware seek) and is therefore allowed for either type.
 */
function assertCursorValueType(
  descriptor: SortDescriptor | undefined,
  value: number | string | null,
): void {
  // `descriptor` is always defined here: decodeCursor already validated
  // payload.sort against this whitelist. Guard kept for type-narrowing only.
  if (descriptor === undefined || value === null) {
    return;
  }
  if (descriptor.numeric && typeof value !== "number") {
    throw new BadCursorError("bad cursor value type");
  }
  if (!descriptor.numeric && typeof value !== "string") {
    throw new BadCursorError("bad cursor value type");
  }
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
  const bountyAfter = decodeFixedCursor(
      query.bountyCursor,
      BOUNTY_SORT,
      BOUNTY_SORT_DEFAULT,
    ),
    playersAfter = decodeFixedCursor(
      query.playersCursor,
      PLAYER_SORT,
      PLAYER_SORT_DEFAULT,
    ),
    squadsAfter = decodeFixedCursor(
      query.squadsCursor,
      SQUAD_SORT,
      SQUAD_SORT_DEFAULT,
    );
  return {
    ...rotationFilters(query),
    ...(bountyAfter === undefined ? {} : { bountyAfter }),
    limit: Number(query.limit),
    ...(playersAfter === undefined ? {} : { playersAfter }),
    ...(squadsAfter === undefined ? {} : { squadsAfter }),
  };
}

/**
 * Decode a leaderboard surface's cursor. Each surface paginates under a FIXED
 * sort/order (its default, `desc`), so the cross-check pins the cursor to that
 * single ordering.
 */
function decodeFixedCursor(
  cursor: string | undefined,
  whitelist: SortWhitelist,
  fixedSort: string,
): PageCursorState | undefined {
  return decodeAfter({ cursor, order: "desc", sort: fixedSort, whitelist });
}

export function emptyPage<T>(): PaginatedResult<T> {
  // eslint-disable-next-line unicorn/no-null -- contract: first page has no next cursor
  return { hasMore: false, items: [], nextCursor: null };
}
