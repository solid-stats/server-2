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
    ["100000000", "1973-03-03T09:46:40.000Z"],
  ])("derives the epoch suffix of %s as %s", (sourceReplayId, expected) => {
    expect(deriveReplayTimestampFromSourceId(sourceReplayId)).toBe(expected);
  });

  it.each([
    ["non-numeric id", "sg-zone-replay"],
    ["empty id", ""],
    ["short numeric suffix (8 digits)", "sg-zone-16241296"],
    ["digits not at the end", "sg-1624129684-zone"],
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
