/* eslint-disable unicorn/no-null -- null is the legacy bound sentinel the predicate accepts (F9). */
import { describe, expect, it } from "vitest";

import { EXCLUDE_PLAYERS } from "../exclude-players-config.js";
import {
  isPlayerExcluded,
  isWithinInterval,
  normalizeExcludeName,
} from "../exclude-players.js";

const ms = (iso: string): number => new Date(iso).getTime();

describe("normalizeExcludeName", () => {
  it("lowercases and trims a plain callsign", () => {
    expect(normalizeExcludeName("  Scandal ")).toBe("scandal");
  });

  it("strips every [...] squad prefix group", () => {
    expect(normalizeExcludeName("[ABC] scandal")).toBe("scandal");
    expect(normalizeExcludeName("[A][B]jm0t")).toBe("jm0t");
  });

  it("returns an empty string for a bracket-only callsign", () => {
    expect(normalizeExcludeName("[ABC]")).toBe("");
  });

  it("strips a leftover lone bracket (legacy getPlayerName parity)", () => {
    expect(normalizeExcludeName("scandal]")).toBe("scandal");
    expect(normalizeExcludeName("[A scandal")).toBe("a scandal");
  });
});

describe("isWithinInterval", () => {
  const at = ms("2022-06-01T00:00:00.000Z");

  it("is unbounded when both bounds are null", () => {
    expect(isWithinInterval(at, null, null)).toBe(true);
  });

  it("respects a non-null upper bound inclusively", () => {
    expect(isWithinInterval(at, null, "2022-06-01T00:00:00.000Z")).toBe(true);
    expect(isWithinInterval(at, null, "2022-05-31T23:59:59.999Z")).toBe(false);
  });

  it("respects a non-null lower bound inclusively", () => {
    expect(isWithinInterval(at, "2022-06-01T00:00:00.000Z", null)).toBe(true);
    expect(isWithinInterval(at, "2022-06-01T00:00:00.001Z", null)).toBe(false);
  });

  it("requires both bounds when both are present", () => {
    expect(
      isWithinInterval(
        at,
        "2022-01-01T00:00:00.000Z",
        "2022-12-31T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      isWithinInterval(
        at,
        "2023-01-01T00:00:00.000Z",
        "2023-12-31T00:00:00.000Z",
      ),
    ).toBe(false);
  });
});

describe("isPlayerExcluded", () => {
  const anyDate = new Date("2021-06-01T00:00:00.000Z");

  it("excludes an unbounded player at any date", () => {
    expect(
      isPlayerExcluded("exile", new Date("1999-01-01T00:00:00.000Z")),
    ).toBe(true);
    expect(
      isPlayerExcluded("exile", new Date("2030-01-01T00:00:00.000Z")),
    ).toBe(true);
  });

  it("returns false for a player not on the list", () => {
    expect(isPlayerExcluded("somebodyelse", anyDate)).toBe(false);
  });

  it("matches case-insensitively and ignores the squad prefix", () => {
    expect(isPlayerExcluded("[SQ] EXILE", anyDate)).toBe(true);
  });

  it("excludes a max-bounded player on or before maxDate (inclusive)", () => {
    expect(
      isPlayerExcluded("scandal", new Date("2019-01-01T00:00:00.000Z")),
    ).toBe(true);
    expect(
      isPlayerExcluded("scandal", new Date("2020-12-01T00:00:00.000Z")),
    ).toBe(true);
  });

  it("includes the maxDate boundary itself (inclusive interval)", () => {
    // mayson: maxDate 2023-01-01T00:00:00.000Z — the boundary instant excludes.
    expect(
      isPlayerExcluded("mayson", new Date("2023-01-01T00:00:00.000Z")),
    ).toBe(true);
  });

  it("does not exclude a max-bounded player after maxDate", () => {
    expect(
      isPlayerExcluded("mayson", new Date("2023-01-02T00:00:00.000Z")),
    ).toBe(false);
  });
});

describe("EXCLUDE_PLAYERS config", () => {
  // Legacy excludePlayers.json: scandal, mayson, exile, mooniverse, jm0t.
  const LEGACY_ENTRY_COUNT = 5;

  it("carries the five legacy entries with lowercase names", () => {
    expect(EXCLUDE_PLAYERS).toHaveLength(LEGACY_ENTRY_COUNT);
    for (const entry of EXCLUDE_PLAYERS) {
      expect(entry.name).toBe(entry.name.toLowerCase());
    }
  });
});
