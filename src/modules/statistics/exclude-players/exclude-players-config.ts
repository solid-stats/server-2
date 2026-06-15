/* eslint-disable unicorn/no-null -- null is the legacy excludePlayers.json bound sentinel, kept so this spec mirrors the source JSON 1:1 (F9). */
/**
 * Player-exclusion spec — committed, versioned config (F9).
 *
 * Owns the legacy `sg-replay-parser` `excludePlayers.json` constants: a small
 * list of players whose per-game result rows are dropped from the aggregate,
 * each optionally bounded to a date interval. Like the game-type spec
 * (`game-type-config.ts`), these are spec values committed alongside the
 * predicate and unit-tested — not a DB seed/table.
 *
 * Source of truth: legacy `excludePlayers.json` (ported 1:1). The legacy
 * matcher strips the squad prefix from the in-game callsign and compares the
 * bare name case-insensitively, excluding a game iff its date falls inside
 * `[minDate ?? -inf, maxDate ?? +inf]` inclusive — replicated by
 * `exclude-players.ts`. (Legacy clamps a null `maxDate` to `now()`; server-2
 * uses `+inf`, which is identical for any real, past-dated replay.)
 */

export interface ExcludePlayer {
  /** Upper bound (inclusive). `null` = no upper bound. */
  maxDate: string | null;
  /** Lower bound (inclusive). `null` = no lower bound. */
  minDate: string | null;
  /** Bare, squad-prefix-stripped callsign (matched case-insensitively). */
  name: string;
}

/**
 * Legacy `excludePlayers.json`, in source order. `exile`/`mooniverse`/`jm0t`
 * are excluded for all dates (both bounds `null`); `scandal`/`mayson` are
 * excluded only up to their `maxDate`.
 */
export const EXCLUDE_PLAYERS: readonly ExcludePlayer[] = [
  { maxDate: "2020-12-01T00:00:00.000Z", minDate: null, name: "scandal" },
  { maxDate: "2023-01-01T00:00:00.000Z", minDate: null, name: "mayson" },
  { maxDate: null, minDate: null, name: "exile" },
  { maxDate: null, minDate: null, name: "mooniverse" },
  { maxDate: null, minDate: null, name: "jm0t" },
] as const;
