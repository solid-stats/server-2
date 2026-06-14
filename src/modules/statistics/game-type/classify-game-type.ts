/* eslint-disable unicorn/no-null -- null is the contractual "excluded" value (D2). */
/**
 * Pure game-type classifier — Postgres-free, unit-testable (D2/D4).
 *
 * Ports the legacy `sg-replay-parser` classification spec (RESEARCH.md B) 1:1.
 * Given a mission name, the replay's distinct-player count, the replay date, and
 * the (optional) source link, returns the canonical `GameType` or `null`.
 * `null` collapses every exclusion reason (D2 — parity does not distinguish
 * *why* a replay is excluded).
 *
 * This file MUST NOT import `pg` or touch the database. The set-based DB
 * write-back lives in `repository/full-run.ts` and calls this per row.
 */
import {
  EXCLUDE_REPLAY_LINKS,
  GAME_TYPES,
  INCLUDE_REPLAYS,
  type GameType,
} from "./game-type-config.js";

export interface ClassifyGameTypeInput {
  /** Distinct player count for the replay (mace <10 filter, B.4). */
  distinctPlayerCount: number;
  /** Mission name from the parser artifact (`replay` block). */
  missionName: string | null;
  /** Replay timestamp (sm month-date filter, B.3). */
  replayDate: Date | null;
  /** Source link in the excludeReplays key form `/replays/<id>` (B.9). */
  sourceLink?: string | undefined;
}

/** Minimum distinct players for a mace replay to count (B.4). */
const MACE_MIN_PLAYERS = 10;

/**
 * sm date cutoff (B.3). Legacy uses dayjs `isAfter('2023-01-01','month')`, which
 * keeps a replay iff its month is strictly after January 2023 — i.e. the first
 * eligible month is February 2023. Replicated at month granularity below.
 */
const SM_MIN_YEAR = 2023;
// January (0-based); a replay is kept iff its month is strictly after this.
const SM_MIN_MONTH_EXCLUSIVE = 0;

const GAME_TYPE_SPLIT_SYMBOL = "@";

const MISSION_CANDIDATE_KEYS = [
  // Real parser-artifact field (F8): the `replay` block uses snake_case keys,
  // each wrapped in the present/value envelope. `mission_name` is the confirmed
  // production field, so it is checked first.
  "mission_name",
  "world_name",
  "map_name",
  // Legacy/back-compat candidates (plain-string forms).
  "mission",
  "missionName",
  "world",
  "worldName",
  "map",
  "mapName",
] as const;

/**
 * Unwrap a raw_snapshot `replay`-block field. The real parser artifact wraps
 * every replay-block field in the present/value envelope
 * (`{ state: "present", value }`), the same shape `repository.ts`'s
 * `presentValue` unwraps for commander/outcome facts. This mirrors those
 * semantics locally so the classifier stays dependency-free and does not import
 * across the public-stats / repository module boundary:
 *   - a plain `string` is returned as-is (back-compat with older snapshots),
 *   - `{ state: "present", value: <string> }` yields `value`,
 *   - `{ state: "absent" }` / missing / a non-string value → `null` (not present).
 */
function unwrapMissionField(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  const envelope = value as { state?: unknown; value?: unknown };
  if (envelope.state === "present" && typeof envelope.value === "string") {
    return envelope.value;
  }
  return null;
}

/**
 * Extract the mission string from a raw_snapshot `replay` block by scanning the
 * candidate keys in priority order, unwrapping the present/value envelope used
 * by the real parser artifact (F8). Returns the first present string value, or
 * null when no candidate is a present string.
 */
export function extractMissionName(
  replay: Record<string, unknown> | null | undefined,
): string | null {
  if (replay === null || replay === undefined) {
    return null;
  }
  for (const key of MISSION_CANDIDATE_KEYS) {
    const value = unwrapMissionField(replay[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function classifyGameType(
  input: ClassifyGameTypeInput,
): GameType | null {
  // 1. Exclude-link first — wins over everything (B.9, B.10 order).
  if (
    input.sourceLink !== undefined &&
    EXCLUDE_REPLAY_LINKS.has(input.sourceLink)
  ) {
    return null;
  }

  const missionName = applyIncludeOverride(input.missionName);
  if (missionName === null) {
    return null;
  }

  // 2. 'sgs*' is excluded for ALL types, case-sensitive (B.2).
  if (missionName.startsWith("sgs")) {
    return null;
  }

  // 3. Prefix match against the fixed game-type order (B.2).
  const gameType = GAME_TYPES.find((type) => missionName.startsWith(type));
  if (gameType === undefined) {
    return null;
  }

  // 4. Per-type filters.
  if (gameType === "mace" && input.distinctPlayerCount < MACE_MIN_PLAYERS) {
    return null;
  }
  if (gameType === "sm" && !isSmDateEligible(input.replayDate)) {
    return null;
  }

  return gameType;
}

/**
 * B.8/B.10 — include override. A mission *without* an `@` separator is looked up
 * in includeReplays by name (case-insensitive); a match is rewritten to
 * `${gameType}@${name}` so the downstream prefix test resolves the forced type.
 * A mission *with* an `@` separator bypasses the list and uses its explicit
 * prefix unchanged. Returns null only when the mission itself is null.
 */
function applyIncludeOverride(missionName: string | null): string | null {
  if (missionName === null) {
    return null;
  }
  if (missionName.includes(GAME_TYPE_SPLIT_SYMBOL)) {
    return missionName;
  }
  const match = INCLUDE_REPLAYS.find(
    (entry) => entry.name.toLowerCase() === missionName.toLowerCase(),
  );
  if (match === undefined) {
    return missionName;
  }
  return `${match.gameType}${GAME_TYPE_SPLIT_SYMBOL}${missionName}`;
}

/** sm month-granular cutoff (B.3): kept iff the replay month is after Jan 2023. */
function isSmDateEligible(replayDate: Date | null): boolean {
  if (replayDate === null) {
    return false;
  }
  const year = replayDate.getUTCFullYear();
  const month = replayDate.getUTCMonth();
  if (year > SM_MIN_YEAR) {
    return true;
  }
  return year === SM_MIN_YEAR && month > SM_MIN_MONTH_EXCLUSIVE;
}
