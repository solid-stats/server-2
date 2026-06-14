import { describe, expect, it } from "vitest";

import { computeIsShow } from "../is-show.js";

describe("computeIsShow", () => {
  it("uses the flat >=20 threshold when scope game count is >= 125", () => {
    // minGames = 20 (the 15% reduction only applies below 125 games).
    expect(computeIsShow(20, 125)).toBe(true);
    expect(computeIsShow(19, 125)).toBe(false);
    expect(computeIsShow(21, 1000)).toBe(true);
    expect(computeIsShow(0, 200)).toBe(false);
  });

  it("treats scope game count = 125 as the >=125 branch (boundary)", () => {
    // 125 → 20 threshold; 124 → 15% branch.
    expect(computeIsShow(20, 125)).toBe(true);
    expect(computeIsShow(19, 125)).toBe(false);
  });

  it("uses the 15% threshold when scope game count is < 125", () => {
    // 124 games → minGames = (15 * 124) / 100 = 18.6 (NOT rounded).
    expect(computeIsShow(19, 124)).toBe(true); // 19 >= 18.6
    expect(computeIsShow(18, 124)).toBe(false); // 18 < 18.6
    // 100 games → minGames = 15 exactly.
    expect(computeIsShow(15, 100)).toBe(true);
    expect(computeIsShow(14, 100)).toBe(false);
  });

  it("replicates the legacy unrounded arithmetic exactly", () => {
    // 50 games → minGames = (15 * 50) / 100 = 7.5; 7 shown? no, 8 shown? yes.
    expect(computeIsShow(8, 50)).toBe(true); // 8 >= 7.5
    expect(computeIsShow(7, 50)).toBe(false); // 7 < 7.5
  });

  it("shows everyone when scope game count is 0 (15% of 0 = 0)", () => {
    expect(computeIsShow(0, 0)).toBe(true);
    expect(computeIsShow(5, 0)).toBe(true);
  });

  it("returns a boolean flag, never mutating or removing", () => {
    expect(typeof computeIsShow(10, 50)).toBe("boolean");
  });
});
