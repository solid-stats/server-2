import { describe, expect, it } from "vitest";

import {
  EXCLUDE_REPLAY_LINKS,
  GAME_TYPES,
  INCLUDE_REPLAYS,
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
