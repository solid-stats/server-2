import { BadCursorError } from "./errors.js";

/**
 * A whitelisted sort field's server-chosen SQL fragment.
 *
 * - `expr` is a FIXED SQL string picked by the server — never the raw request
 *   value — so a malicious `?sort=` can never reach the query as SQL.
 * - `nullable` records whether the sort expression can produce NULL rows. All
 *   current fields are non-nullable: the stat sums are wrapped in
 *   `coalesce(..., 0)` and `name`/`points` are NOT NULL stored columns. The
 *   keyset builder still implements the IS NULL branches for any future
 *   nullable field (e.g. a `last_seen` timestamp).
 */
/**
 * SQL cast applied to a keyset bound value. It must match the SQL TYPE of the
 * sort `expr`, not merely "is this numeric":
 * - `"bigint"` for aggregate `sum(integer)` keys — PostgreSQL types `sum(int)`
 *   as `bigint`, so casting the bound value to `::int` throws
 *   `integer out of range` once the aggregate exceeds 2^31 (CR-01). It is also
 *   safe for stored `int4` columns (an int value widens to bigint losslessly).
 * - `"text"` for textual sort keys.
 */
export type SortCastType = "bigint" | "text";

export interface SortDescriptor {
  expr: string;
  /** Whether the sort key is numeric (drives cursor value-type validation). */
  numeric: boolean;
  /** SQL cast applied to the bound seek value in the keyset predicate. */
  castType: SortCastType;
  nullable: boolean;
}

/** Resolved sort descriptor, including the canonical field name. */
export interface ResolvedSort {
  field: string;
  expr: string;
  numeric: boolean;
  castType: SortCastType;
  nullable: boolean;
}

type SortWhitelist = Readonly<Record<string, SortDescriptor>>;

const KILLS_EXPR = "coalesce(sum((stats.stats->>'kills')::integer), 0)",
  TEAMKILLS_EXPR = "coalesce(sum((stats.stats->>'teamkills')::integer), 0)";

/** Player list sortable fields (kills/teamkills are aggregates; name is a column). */
export const PLAYER_SORT = {
  kills: {
    expr: KILLS_EXPR,
    numeric: true,
    castType: "bigint",
    nullable: false,
  },
  name: {
    expr: "players.display_name",
    numeric: false,
    castType: "text",
    nullable: false,
  },
  teamkills: {
    expr: TEAMKILLS_EXPR,
    numeric: true,
    castType: "bigint",
    nullable: false,
  },
} as const satisfies SortWhitelist;

/** Squad list sortable fields. */
export const SQUAD_SORT = {
  kills: {
    expr: KILLS_EXPR,
    numeric: true,
    castType: "bigint",
    nullable: false,
  },
  name: {
    expr: "squads.name",
    numeric: false,
    castType: "text",
    nullable: false,
  },
  teamkills: {
    expr: TEAMKILLS_EXPR,
    numeric: true,
    castType: "bigint",
    nullable: false,
  },
} as const satisfies SortWhitelist;

/** Bounty list sortable fields (points is a stored column, not an aggregate). */
export const BOUNTY_SORT = {
  points: {
    expr: "bounty.points",
    numeric: true,
    castType: "bigint",
    nullable: false,
  },
} as const satisfies SortWhitelist;

/** Replay list sortable fields (replay_timestamp is a stored NULLABLE column). */
export const REPLAY_SORT = {
  date: {
    expr: "replays.replay_timestamp",
    numeric: false,
    castType: "text",
    nullable: true,
  },
} as const satisfies SortWhitelist;

/** Parser events sortable fields (occurred_at is a stored NULLABLE column). */
export const EVENT_SORT = {
  time: {
    expr: "events.occurred_at",
    numeric: false,
    castType: "text",
    nullable: true,
  },
} as const satisfies SortWhitelist;

export type PlayerSortField = keyof typeof PLAYER_SORT;
export type SquadSortField = keyof typeof SQUAD_SORT;
export type BountySortField = keyof typeof BOUNTY_SORT;
export type ReplaySortField = keyof typeof REPLAY_SORT;
export type EventSortField = keyof typeof EVENT_SORT;

export const PLAYER_SORT_DEFAULT: PlayerSortField = "kills";
export const SQUAD_SORT_DEFAULT: SquadSortField = "kills";
export const BOUNTY_SORT_DEFAULT: BountySortField = "points";
export const REPLAY_SORT_DEFAULT: ReplaySortField = "date";
export const EVENT_SORT_DEFAULT: EventSortField = "time";

/** Hard maximum page size for parser events. The repository enforces this. */
export const EVENT_PAGE_MAX = 200;
/** Default page size for parser events when the caller does not specify. */
export const EVENT_PAGE_DEFAULT = 50;

/**
 * Resolve a requested sort field against an endpoint's whitelist.
 *
 * Returns the requested field's descriptor when whitelisted, the default's
 * descriptor when `requested` is undefined, and throws {@link BadCursorError}
 * for a non-whitelisted string. The returned `field` is always a canonical
 * whitelisted key — never the raw request value.
 */
export function resolveSort(
  whitelist: SortWhitelist,
  requested: string | undefined,
  defaultField: string,
): ResolvedSort {
  const field = requested ?? defaultField,
    descriptor = whitelist[field];
  if (descriptor === undefined) {
    throw new BadCursorError("unknown sort field");
  }
  return {
    castType: descriptor.castType,
    expr: descriptor.expr,
    field,
    numeric: descriptor.numeric,
    nullable: descriptor.nullable,
  };
}
