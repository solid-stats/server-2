/**
 * Game-type classification spec — committed, versioned config (D4).
 *
 * This module owns the legacy `sg-replay-parser` classification *constants*:
 * the fixed game-type order, the prefix-less include overrides, and the
 * excluded source links. D4 explicitly rejects a DB seed/table for these —
 * they are spec values committed alongside the classifier and unit-tested.
 *
 * Source of truth: RESEARCH.md section B (ported 1:1 from the legacy
 * `0 - consts/gameTypesArray.ts`, `includeReplays.json`, `excludeReplays.json`).
 */

/** B.1 — fixed lowercase game-type order. */
export const GAME_TYPES = ["sg", "mace", "sm"] as const;

export type GameType = (typeof GAME_TYPES)[number];

export interface IncludeReplay {
  gameType: GameType;
  name: string;
}

/**
 * B.8 — prefix-less missions force-mapped to a game type by display name.
 * Legacy rewrites a matched name to `${gameType}@${snakeCase(name)}` so it then
 * prefix-matches the type; we keep the name→type mapping and apply it in the
 * classifier (case-insensitive, only when the mission has no `@` separator).
 */
export const INCLUDE_REPLAYS: readonly IncludeReplay[] = [
  { gameType: "sg", name: "Red Dawn" },
  { gameType: "sg", name: "Unorthodox Methods" },
  { gameType: "sg", name: "Nuclear Danger" },
] as const;

/**
 * B.9 — raw legacy exclude links (16 entries, one duplicate
 * `/replays/1612798741`). Deduped to a readonly Set on load so the duplicate is
 * provably removed (asserted in tests). A replay whose source link is present
 * here is excluded from every game type.
 */
const RAW_EXCLUDE_REPLAY_LINKS: readonly string[] = [
  "/replays/1662231981",
  "/replays/1669587454",
  "/replays/1730151978",
  "/replays/1730148314",
  "/replays/1743953545",
  "/replays/1743954150",
  "/replays/1743963082",
  "/replays/1743963893",
  "/replays/1728933076",
  "/replays/1728929965",
  "/replays/1664221753",
  "/replays/1612798741",
  "/replays/1613942158",
  "/replays/1613935909",
  "/replays/1612798741",
  "/replays/1607893786",
] as const;

export const EXCLUDE_REPLAY_LINKS: ReadonlySet<string> = new Set(
  RAW_EXCLUDE_REPLAY_LINKS,
);
