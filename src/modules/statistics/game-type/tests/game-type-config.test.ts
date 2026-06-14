/* eslint-disable no-magic-numbers -- test asserts exact deduped set length. */
import { describe, expect, it } from "vitest";

import {
  EXCLUDE_REPLAY_LINKS,
  GAME_TYPES,
  INCLUDE_REPLAYS,
  assertExcludeListInvariant,
} from "../game-type-config.js";

describe("game-type-config", () => {
  it("pins the fixed lowercase game-type order from the legacy spec (B.1)", () => {
    expect(GAME_TYPES).toStrictEqual(["sg", "mace", "sm"]);
  });

  it("exposes the three include-forced replays mapped to 'sg' (B.8)", () => {
    expect(INCLUDE_REPLAYS).toStrictEqual([
      { gameType: "sg", name: "Red Dawn" },
      { gameType: "sg", name: "Unorthodox Methods" },
      { gameType: "sg", name: "Nuclear Danger" },
    ]);
  });

  it("dedupes the 16 raw exclude links down to 15 distinct entries (B.9)", () => {
    // The raw legacy list has 16 entries with one duplicate (/replays/1612798741).
    expect(EXCLUDE_REPLAY_LINKS.size).toBe(15);
  });

  it("loads without tripping the in-module raw/distinct count invariant (B.9)", () => {
    // The module invokes assertExcludeListInvariant at import time; a successful
    // import proves the real constants (16 raw / 15 distinct) pass.
    expect(() => {
      assertExcludeListInvariant(16, 15);
    }).not.toThrow();
  });

  it("assertExcludeListInvariant throws when the raw exclude-link count drifts (B.9)", () => {
    expect(() => {
      assertExcludeListInvariant(17, 15);
    }).toThrow(/16 raw exclude links, got 17/u);
  });

  it("assertExcludeListInvariant throws when the deduped exclude-link count drifts (B.9)", () => {
    expect(() => {
      assertExcludeListInvariant(16, 14);
    }).toThrow(/15 distinct exclude links, got 14/u);
  });

  it("contains a known exclude link", () => {
    expect(EXCLUDE_REPLAY_LINKS.has("/replays/1662231981")).toBe(true);
  });

  it("contains the de-duplicated link exactly once", () => {
    expect(EXCLUDE_REPLAY_LINKS.has("/replays/1612798741")).toBe(true);
  });

  it("does not contain an unrelated link", () => {
    expect(EXCLUDE_REPLAY_LINKS.has("/replays/9999999999")).toBe(false);
  });
});
