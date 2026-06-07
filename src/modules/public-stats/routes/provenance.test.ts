/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { maxTimestamp } from "./provenance.js";

describe("maxTimestamp", () => {
  it("returns null for an empty array", () => {
    expect(maxTimestamp([])).toBeNull();
  });

  it("returns null when all values are null", () => {
    expect(maxTimestamp([null, null])).toBeNull();
  });

  it("returns null when all values are undefined", () => {
    expect(maxTimestamp([undefined, undefined])).toBeNull();
  });

  it("returns null when the array contains only null and undefined", () => {
    expect(maxTimestamp([null, undefined, null])).toBeNull();
  });

  it("returns the ISO-8601 UTC string for a single Date", () => {
    const d = new Date("2021-06-15T00:00:00.000Z");
    expect(maxTimestamp([d])).toBe("2021-06-15T00:00:00.000Z");
  });

  it("returns the maximum Date as ISO-8601 UTC when multiple Dates are present", () => {
    expect(
      maxTimestamp([
        new Date("2020-01-01T00:00:00.000Z"),
        new Date("2021-06-15T00:00:00.000Z"),
        null,
      ]),
    ).toBe("2021-06-15T00:00:00.000Z");
  });

  it("ignores null and undefined values and returns the max of the Dates", () => {
    expect(
      maxTimestamp([
        null,
        new Date("2019-03-10T12:00:00.000Z"),
        undefined,
        new Date("2022-11-30T08:30:00.000Z"),
        null,
      ]),
    ).toBe("2022-11-30T08:30:00.000Z");
  });

  it("returns a single Date correctly when mixed with null", () => {
    expect(
      maxTimestamp([null, new Date("2020-06-01T00:00:00.000Z")]),
    ).toBe("2020-06-01T00:00:00.000Z");
  });

  it("never derives the value from Date.now() — result changes only with input", () => {
    // If maxTimestamp used now() it would return a non-null for an empty array,
    // violating HIST-03. The null-on-empty test above covers this; we add an
    // explicit oracle here to make the invariant legible.
    const result = maxTimestamp([]);
    expect(result).toBeNull();
  });
});
