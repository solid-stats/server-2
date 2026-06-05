/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { leaderboardFilters, page } from "./filters.js";
import { encodeCursor } from "./pagination/cursor.js";
import { BadCursorError } from "./pagination/errors.js";
import { PLAYER_SORT } from "./pagination/sort.js";

const SAMPLE_ID = "00000000-0000-4000-8000-000000000601",
  SORT_VALUE = 7,
  LEADERBOARD_LIMIT = 10;

describe("page() cursor decoding", () => {
  it("resolves the first page (no cursor) to sort/order/limit with no after", () => {
    const result = page(
      { limit: 10, order: "desc", sort: "kills" },
      PLAYER_SORT,
      "kills",
    );

    expect(result).toEqual({ limit: 10, order: "desc", sort: "kills" });
  });

  it("decodes a matching cursor into the after boundary", () => {
    const cursor = encodeCursor({
        id: SAMPLE_ID,
        order: "desc",
        sort: "kills",
        values: [SORT_VALUE],
      }),
      result = page(
        { cursor, limit: 10, order: "desc", sort: "kills" },
        PLAYER_SORT,
        "kills",
      );

    expect(result).toEqual({
      after: { id: SAMPLE_ID, value: SORT_VALUE },
      limit: 10,
      order: "desc",
      sort: "kills",
    });
  });

  it("rejects a cursor whose encoded order differs from the request", () => {
    const cursor = encodeCursor({
      id: SAMPLE_ID,
      order: "desc",
      sort: "kills",
      values: [SORT_VALUE],
    });

    expect(() =>
      page({ cursor, order: "asc", sort: "kills" }, PLAYER_SORT, "kills"),
    ).toThrow(BadCursorError);
  });

  it("rejects an unknown sort field", () => {
    expect(() => page({ sort: "nonsense" }, PLAYER_SORT, "kills")).toThrow(
      BadCursorError,
    );
  });

  it("rejects a tampered cursor carrying a string value for a numeric sort field (WR-04)", () => {
    const cursor = encodeCursor({
      id: SAMPLE_ID,
      order: "desc",
      sort: "kills",
      values: ["abc"],
    });

    // Must fail closed as a BadCursorError (-> 400), never reach SQL as
    // 'abc'::bigint (-> 500).
    expect(() =>
      page({ cursor, order: "desc", sort: "kills" }, PLAYER_SORT, "kills"),
    ).toThrow(BadCursorError);
  });

  it("rejects a tampered cursor carrying a number value for a text sort field (WR-04)", () => {
    const cursor = encodeCursor({
      id: SAMPLE_ID,
      order: "desc",
      sort: "name",
      values: [SORT_VALUE],
    });

    expect(() =>
      page({ cursor, order: "desc", sort: "name" }, PLAYER_SORT, "kills"),
    ).toThrow(BadCursorError);
  });

  it("decodes a null sort value as a valid keyset boundary", () => {
    const cursor = encodeCursor({
        id: SAMPLE_ID,
        order: "desc",
        sort: "name",
        values: [null],
      }),
      result = page(
        { cursor, order: "desc", sort: "name" },
        PLAYER_SORT,
        "kills",
      );

    expect(result.after).toEqual({ id: SAMPLE_ID, value: null });
  });
});

function fixedCursor(sort: string): string {
  return encodeCursor({
    id: SAMPLE_ID,
    order: "desc",
    sort,
    values: [SORT_VALUE],
  });
}

describe("leaderboardFilters cursor decoding", () => {
  it("decodes each surface's fixed cursor into its after boundary", () => {
    const result = leaderboardFilters({
      bountyCursor: fixedCursor("points"),
      limit: LEADERBOARD_LIMIT,
      playersCursor: fixedCursor("kills"),
      squadsCursor: fixedCursor("kills"),
    });

    expect(result).toMatchObject({
      bountyAfter: { id: SAMPLE_ID, value: SORT_VALUE },
      limit: LEADERBOARD_LIMIT,
      playersAfter: { id: SAMPLE_ID, value: SORT_VALUE },
      squadsAfter: { id: SAMPLE_ID, value: SORT_VALUE },
    });
  });

  it("omits surface boundaries when no cursor is supplied", () => {
    const result = leaderboardFilters({ limit: LEADERBOARD_LIMIT });

    expect(result).not.toHaveProperty("bountyAfter");
    expect(result).not.toHaveProperty("playersAfter");
    expect(result).not.toHaveProperty("squadsAfter");
  });
});
