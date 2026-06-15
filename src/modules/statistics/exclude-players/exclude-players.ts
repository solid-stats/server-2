/**
 * Pure player-exclusion predicate (F9) — Postgres-free, unit-testable.
 *
 * Ports the legacy `sg-replay-parser` `excludePlayers.json` filter 1:1. The
 * legacy aggregator (`3 - statistics/global/add.ts`) drops a player's per-game
 * result row when the squad-stripped callsign matches an excluded name
 * (case-insensitive) and the game date falls inside the entry's interval. The
 * repository applies this at the artifact→evidence seam (`resolvedPlayers`), so
 * an excluded player contributes nothing to player/squad/commander/bounty
 * aggregates — while deaths they inflicted on others (recorded on the victim's
 * own row) are unaffected, matching the legacy skip-the-result-row semantics.
 *
 * This file MUST NOT import `pg` or touch the database.
 */
import { EXCLUDE_PLAYERS } from "./exclude-players-config.js";

/** Matches every `[...]` squad-prefix group in a callsign. */
const SQUAD_PREFIX = /\[.*?\]/gu;
/** Matches any leftover lone bracket after the groups are removed. */
const STRAY_BRACKET = /[[\]]/gu;

/**
 * Legacy `getPlayerName` normalization: strip every `[...]` squad-prefix group
 * and any leftover lone `[`/`]`, then trim. Legacy compares the result
 * case-insensitively, so this lowercases too (legacy lowercases at the
 * comparison site — behaviorally identical). `"[ABC] scandal"` and `"Scandal"`
 * both normalize to `"scandal"`.
 */
export function normalizeExcludeName(callsign: string): string {
  return callsign
    .replaceAll(SQUAD_PREFIX, "")
    .replaceAll(STRAY_BRACKET, "")
    .trim()
    .toLowerCase();
}

/**
 * Legacy inclusive interval `[minDate ?? -inf, maxDate ?? +inf]`. A `null` bound
 * is unbounded (legacy used `1970-01-01` / `now`, both equivalent to the
 * sentinels for real replay dates). Bounds are ISO strings; `time` is an epoch
 * millisecond value.
 */
export function isWithinInterval(
  time: number,
  minDate: string | null,
  maxDate: string | null,
): boolean {
  const min = minDate === null ? Number.NEGATIVE_INFINITY : Date.parse(minDate),
    max = maxDate === null ? Number.POSITIVE_INFINITY : Date.parse(maxDate);
  return time >= min && time <= max;
}

/**
 * Whether the player named `callsign` is excluded for a game played at
 * `replayDate` (squad-stripped, case-insensitive name match within the entry's
 * inclusive date interval).
 */
export function isPlayerExcluded(callsign: string, replayDate: Date): boolean {
  const name = normalizeExcludeName(callsign),
    entry = EXCLUDE_PLAYERS.find((player) => player.name === name);
  if (entry === undefined) {
    return false;
  }
  return isWithinInterval(replayDate.getTime(), entry.minDate, entry.maxDate);
}
