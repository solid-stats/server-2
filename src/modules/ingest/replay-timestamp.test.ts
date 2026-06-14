/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  deriveReplayTimestampFromSourceId,
  resolveReplayTimestamp,
} from "./replay-timestamp.js";

describe("deriveReplayTimestampFromSourceId", () => {
  it.each([
    ["sg-zone-1624129684", "2021-06-19T19:08:04.000Z"],
    ["mace-zone-1624129684", "2021-06-19T19:08:04.000Z"],
    ["1624129684", "2021-06-19T19:08:04.000Z"],
    // Lower bound (1e9, 2001-09) and upper bound (2e9, 2033-05) are accepted inclusively.
    ["sg-zone-1000000000", "2001-09-09T01:46:40.000Z"],
    ["sg-zone-2000000000", "2033-05-18T03:33:20.000Z"],
  ])("derives the epoch suffix of %s as %s", (sourceReplayId, expected) => {
    expect(deriveReplayTimestampFromSourceId(sourceReplayId)).toBe(expected);
  });

  it.each([
    ["non-numeric id", "sg-zone-replay"],
    ["empty id", ""],
    ["short numeric suffix (8 digits)", "sg-zone-16241296"],
    ["digits not at the end", "sg-1624129684-zone"],
    // Not exactly 10 trailing digits: a 9-digit run is short of the anchor (SQL `\d{10}$` misses
    // it). It is also < 1e9, but the exact-10 anchor rejects it first.
    ["9-digit run (not exactly 10)", "123456789"],
    ["pre-2001 9-digit epoch (100000000)", "100000000"],
    // 11+-digit unbroken runs are not exactly 10 trailing digits, so SQL's `\d{10}$` (anchored to
    // the string end) never matches them -- they stay NULL, never read as a far-future epoch.
    ["11-digit run", "16241296840"],
    ["11-digit run (year ~5138)", "sg-zone-99999999999"],
    ["13-digit run (millisecond-looking epoch)", "sg-zone-1624129684000"],
    ["19-digit run (int8 overflow in SQL)", "sg-zone-1234567890123456789"],
    // Zero-padded all-numeric id longer than 10 digits: the OLD greedy `\d{9,}$` + Number() would
    // strip the leading zeros to 1500000000 (in range) and ACCEPT it, while SQL's exact-10
    // `(\D|^)\d{10}$` leaves the row NULL. The exact-10 anchor now rejects it in TS too, matching
    // SQL. This is the residual divergence F12's code review flagged.
    ["zero-padded 20-digit run (greedy-strip trap)", "00000000001500000000"],
    // A 10-digit run captured cleanly but out of the bound: 0999999999 is < 1e9; 2000000001 > 2e9.
    ["10-digit run below the lower bound (0999999999)", "sg-zone-0999999999"],
    ["just above the upper bound (2000000001)", "sg-zone-2000000001"],
    // 11-digit runs: the trailing 10 digits are preceded by a digit (the leading 3), not a
    // non-digit or string start, so `(\D|^)\d{10}$` never matches -- NULL, same as SQL.
    ["above range, 11-digit run (30000000000)", "30000000000"],
    ["above range with prefix (sg-zone-30000000000)", "sg-zone-30000000000"],
  ])("returns null for %s", (_label, sourceReplayId) => {
    expect(deriveReplayTimestampFromSourceId(sourceReplayId)).toBeNull();
  });
});

describe("resolveReplayTimestamp", () => {
  it("keeps the primary timestamp when present", () => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: "2026-05-09T00:00:00.000Z",
        sourceReplayId: "sg-zone-1624129684",
      }),
    ).toBe("2026-05-09T00:00:00.000Z");
  });

  it("falls back to the source-id epoch when the primary timestamp is null", () => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: null,
        sourceReplayId: "sg-zone-1624129684",
      }),
    ).toBe("2021-06-19T19:08:04.000Z");
  });

  it("returns null when neither a primary timestamp nor a parseable epoch exists", () => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: null,
        sourceReplayId: "sg-zone-replay",
      }),
    ).toBeNull();
  });
});
