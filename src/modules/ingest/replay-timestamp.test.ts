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
    // Below the plausible-epoch lower bound: 999999999 (< 1e9) and the old 9-digit "year 1973" id.
    ["just below the lower bound (999999999)", "sg-zone-999999999"],
    ["pre-2001 9-digit epoch (100000000)", "100000000"],
    // Above the upper bound: 2000000001 (> 2e9) and far-future 11-13 digit runs.
    ["just above the upper bound (2000000001)", "sg-zone-2000000001"],
    ["11-digit run (year ~5138)", "sg-zone-99999999999"],
    ["13-digit run (millisecond-looking epoch)", "sg-zone-1624129684000"],
    // >= 19-digit run that would overflow int8 in SQL must also be rejected in TS.
    ["19-digit run (int8 overflow in SQL)", "sg-zone-1234567890123456789"],
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
