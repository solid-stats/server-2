/**
 * Pure `is_show` computation — the legacy `filterPlayersByTotalPlayedGames` port
 * (RESEARCH B.6 / CONTEXT D3).
 *
 * Legacy marks each player `isShow: true/false` per scope (mode `'not show'` — it
 * does NOT remove anyone). The threshold is a flat `20` games, EXCEPT when the
 * scope's game count is below 125, where it becomes 15% of the scope's game
 * count. The legacy arithmetic is `(15 * gamesCount) / 100` and is intentionally
 * NOT rounded — replicated verbatim here so the new-side split byte-matches
 * legacy. This file is pure: no Postgres, no I/O.
 */

/** Below this scope game count the threshold drops to 15% (legacy B.6). */
const SCOPE_GAMES_FLAT_THRESHOLD = 125;

/** Flat minimum games for a player to be shown at scope >= 125 (legacy B.6). */
const FLAT_MIN_GAMES = 20;

/** Legacy 15% reduction numerator/denominator (`(15 * gamesCount) / 100`). */
const PERCENT_NUMERATOR = 15;
const PERCENT_DENOMINATOR = 100;

/**
 * Whether a player with `totalPlayedGames` is shown for a scope of
 * `scopeGameCount` games. Mirrors legacy `filterPlayersByTotalPlayedGames`:
 *   minGamesCount = 20; if (gamesCount < 125) minGamesCount = (15 * gamesCount) / 100;
 *   isShow = totalPlayedGames >= minGamesCount.
 */
export function computeIsShow(
  totalPlayedGames: number,
  scopeGameCount: number,
): boolean {
  const minGamesCount =
    scopeGameCount < SCOPE_GAMES_FLAT_THRESHOLD
      ? (PERCENT_NUMERATOR * scopeGameCount) / PERCENT_DENOMINATOR
      : FLAT_MIN_GAMES;
  return totalPlayedGames >= minGamesCount;
}
