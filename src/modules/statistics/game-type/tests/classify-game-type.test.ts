/* eslint-disable unicorn/no-null -- null is the contractual "excluded" value (D2). */
import { describe, expect, it } from "vitest";

import {
  classifyGameType,
  extractMissionName,
  type ClassifyGameTypeInput,
} from "../classify-game-type.js";

function input(
  overrides: Partial<ClassifyGameTypeInput> = {},
): ClassifyGameTypeInput {
  return {
    distinctPlayerCount: 50,
    missionName: "sg_x",
    replayDate: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("classifyGameType", () => {
  it("classifies an sg-prefixed mission as 'sg' (B.2)", () => {
    expect(classifyGameType(input({ missionName: "sg_x" }))).toBe("sg");
  });

  it("matches the prefix with no separator required", () => {
    expect(classifyGameType(input({ missionName: "sg123" }))).toBe("sg");
    expect(
      classifyGameType(input({ distinctPlayerCount: 12, missionName: "mace2" })),
    ).toBe("mace");
    expect(
      classifyGameType(
        input({
          missionName: "sm1",
          replayDate: new Date("2024-01-01T00:00:00.000Z"),
        }),
      ),
    ).toBe("sm");
  });

  it("excludes anything starting with 'sgs' for ALL types (B.2)", () => {
    expect(classifyGameType(input({ missionName: "sgsomething" }))).toBeNull();
    expect(classifyGameType(input({ missionName: "sgs" }))).toBeNull();
  });

  it("treats the 'sgs' rule as case-sensitive", () => {
    // 'SGS...' does not start with lowercase 'sgs' and also does not start with
    // any lowercase game-type prefix → null (no matching prefix).
    expect(classifyGameType(input({ missionName: "SGS_x" }))).toBeNull();
  });

  it("returns null for a mace replay with fewer than 10 distinct players (B.4)", () => {
    expect(
      classifyGameType(input({ distinctPlayerCount: 9, missionName: "mace_x" })),
    ).toBeNull();
  });

  it("returns 'mace' for a mace replay with exactly 10 distinct players (B.4)", () => {
    expect(
      classifyGameType(
        input({ distinctPlayerCount: 10, missionName: "mace_x" }),
      ),
    ).toBe("mace");
  });

  it("does not apply the <10 player filter to sg or sm", () => {
    expect(
      classifyGameType(input({ distinctPlayerCount: 1, missionName: "sg_x" })),
    ).toBe("sg");
  });

  it("drops sm replays in January 2023 (month-granular cutoff, B.3)", () => {
    // Legacy isAfter('2023-01-01','month'): kept iff month strictly after Jan 2023.
    expect(
      classifyGameType(
        input({
          missionName: "sm_x",
          replayDate: new Date("2023-01-31T23:59:59.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("keeps sm replays from February 2023 onward (B.3)", () => {
    expect(
      classifyGameType(
        input({
          missionName: "sm_x",
          replayDate: new Date("2023-02-01T00:00:00.000Z"),
        }),
      ),
    ).toBe("sm");
  });

  it("drops sm replays before 2023 entirely (B.3)", () => {
    expect(
      classifyGameType(
        input({
          missionName: "sm_x",
          replayDate: new Date("2022-12-31T23:59:59.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("returns null for an sm replay with no date (cannot pass the date filter)", () => {
    expect(
      classifyGameType(input({ missionName: "sm_x", replayDate: null })),
    ).toBeNull();
  });

  it("does not apply the sm date filter to sg or mace", () => {
    expect(
      classifyGameType(
        input({
          missionName: "sg_x",
          replayDate: new Date("2019-01-01T00:00:00.000Z"),
        }),
      ),
    ).toBe("sg");
  });

  it("forces 'sg' for a prefix-less mission present in includeReplays by name (B.8)", () => {
    // Legacy rewrites "Red Dawn" → "sg@red_dawn"; the mission then prefix-matches sg.
    expect(classifyGameType(input({ missionName: "Red Dawn" }))).toBe("sg");
  });

  it("matches include names case-insensitively", () => {
    expect(classifyGameType(input({ missionName: "red dawn" }))).toBe("sg");
  });

  it("does not consult includeReplays when the mission already has an '@' separator (B.8/B.10)", () => {
    // A mission with '@' uses its explicit prefix; "Red Dawn@x" does not start
    // with any game-type prefix, so it is null even though "Red Dawn" is in the list.
    expect(classifyGameType(input({ missionName: "Red Dawn@x" }))).toBeNull();
    // The explicit prefix path still works for a real prefix.
    expect(classifyGameType(input({ missionName: "sg@red_dawn" }))).toBe("sg");
  });

  it("excludes a replay whose source link is in excludeReplays regardless of mission (B.9)", () => {
    expect(
      classifyGameType(
        input({ missionName: "sg_x", sourceLink: "/replays/1662231981" }),
      ),
    ).toBeNull();
  });

  it("returns null for a mission with no matching prefix and not in includeReplays", () => {
    expect(classifyGameType(input({ missionName: "tvt_x" }))).toBeNull();
  });

  it("returns null for an absent mission name", () => {
    expect(classifyGameType(input({ missionName: null }))).toBeNull();
  });
});

describe("extractMissionName", () => {
  it("reads the mission from the candidate keys in priority order", () => {
    expect(extractMissionName({ mission: "sg_x" })).toBe("sg_x");
    expect(extractMissionName({ missionName: "mace_y" })).toBe("mace_y");
    expect(extractMissionName({ world: "sm_z" })).toBe("sm_z");
  });

  it("prefers 'mission' over later candidate keys", () => {
    expect(extractMissionName({ mission: "sg_a", world: "sm_b" })).toBe("sg_a");
  });

  it("returns null for an absent or empty replay block", () => {
    const absent: Record<string, unknown> | undefined = undefined;
    expect(extractMissionName(null)).toBeNull();
    expect(extractMissionName(absent)).toBeNull();
    expect(extractMissionName({})).toBeNull();
  });
});
