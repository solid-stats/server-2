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
    // Lower bound (1420070400, 2015-01-01) and upper bound (2051222400, 2035-01-01) are accepted
    // inclusively — the fetcher's authoritative window.
    ["sg-zone-1420070400", "2015-01-01T00:00:00.000Z"],
    ["sg-zone-2051222400", "2035-01-01T00:00:00.000Z"],
    // 2000000000 is inside the new window (1420070400 < 2000000000 < 2051222400), so still accepted.
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
    // it). It is also below the lower bound, but the exact-10 anchor rejects it first.
    ["9-digit run (not exactly 10)", "123456789"],
    ["pre-2001 9-digit epoch (100000000)", "100000000"],
    // 11+-digit unbroken runs are not exactly 10 trailing digits, so SQL's `\d{10}$` (anchored to
    // the string end) never matches them -- they stay untouched, never read as a far-future epoch.
    ["11-digit run", "16241296840"],
    ["11-digit run (year ~5138)", "sg-zone-99999999999"],
    ["13-digit run (millisecond-looking epoch)", "sg-zone-1624129684000"],
    ["19-digit run (int8 overflow in SQL)", "sg-zone-1234567890123456789"],
    // Zero-padded all-numeric id longer than 10 digits: the OLD greedy `\d{9,}$` + Number() would
    // strip the leading zeros to 1500000000 (in range) and ACCEPT it, while SQL's exact-10
    // `(\D|^)\d{10}$` leaves the row untouched. The exact-10 anchor rejects it in TS too, matching
    // SQL. This is the residual divergence F12's code review flagged.
    ["zero-padded 20-digit run (greedy-strip trap)", "00000000001500000000"],
    // A clean 10-digit run, but out of the new [1420070400, 2051222400] bound. 1420070399 is one
    // second below the lower bound; 2051222401 is one second above the upper bound.
    ["just below the lower bound (1420070399)", "sg-zone-1420070399"],
    ["just above the upper bound (2051222401)", "sg-zone-2051222401"],
    // 1000000000 (2001-09) was accepted under the OLD [1e9, 2e9] window but is below the new lower
    // bound 1420070400, so it is now rejected. 0999999999 is likewise below the lower bound.
    [
      "10-digit run below the new lower bound (1000000000)",
      "sg-zone-1000000000",
    ],
    ["10-digit run below the lower bound (0999999999)", "sg-zone-0999999999"],
    // 11-digit runs: the trailing 10 digits are preceded by a digit (the leading 3), not a
    // non-digit or string start, so `(\D|^)\d{10}$` never matches -- untouched, same as SQL.
    ["above range, 11-digit run (30000000000)", "30000000000"],
    ["above range with prefix (sg-zone-30000000000)", "sg-zone-30000000000"],
  ])("returns null for %s", (_label, sourceReplayId) => {
    expect(deriveReplayTimestampFromSourceId(sourceReplayId)).toBeNull();
  });
});

describe("resolveReplayTimestamp", () => {
  it("overrides a different present staged timestamp with the in-range source-id epoch", () => {
    // Epoch-primary: the epoch encoded in the id wins over the staged value, even when the staged
    // value is present and different. The staged value was the wrong-timezone / wrong-event value.
    expect(
      resolveReplayTimestamp({
        replayTimestamp: "2026-05-09T00:00:00.000Z",
        sourceReplayId: "sg-zone-1624129684",
      }),
    ).toBe("2021-06-19T19:08:04.000Z");
  });

  it.each([
    ["a `derived:` id has no epoch", "derived:sg-zone-replay"],
    ["a non-numeric id has no epoch", "sg-zone-replay"],
    ["an out-of-range epoch is rejected", "sg-zone-1000000000"],
  ])("falls back to the staged timestamp when %s", (_label, sourceReplayId) => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: "2026-05-09T00:00:00.000Z",
        sourceReplayId,
      }),
    ).toBe("2026-05-09T00:00:00.000Z");
  });

  it("uses the source-id epoch when the staged timestamp is null", () => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: null,
        sourceReplayId: "sg-zone-1624129684",
      }),
    ).toBe("2021-06-19T19:08:04.000Z");
  });

  it("returns null when neither an in-range epoch nor a staged timestamp exists", () => {
    expect(
      resolveReplayTimestamp({
        replayTimestamp: null,
        sourceReplayId: "sg-zone-replay",
      }),
    ).toBeNull();
  });
});
