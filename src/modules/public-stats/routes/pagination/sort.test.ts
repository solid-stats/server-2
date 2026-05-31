import { describe, expect, it } from "vitest";

import { BadCursorError } from "./errors.js";
import {
  BOUNTY_SORT,
  BOUNTY_SORT_DEFAULT,
  PLAYER_SORT,
  PLAYER_SORT_DEFAULT,
  resolveSort,
  SQUAD_SORT,
  SQUAD_SORT_DEFAULT,
} from "./sort.js";

describe("sort whitelist expressions", () => {
  it("maps player kills to the exact aggregate SQL expression", () => {
    expect(PLAYER_SORT.kills.expr).toBe(
      "coalesce(sum((stats.stats->>'kills')::integer), 0)",
    );
  });

  it("maps player teamkills to the exact aggregate SQL expression", () => {
    expect(PLAYER_SORT.teamkills.expr).toBe(
      "coalesce(sum((stats.stats->>'teamkills')::integer), 0)",
    );
  });

  it("maps squad kills to the exact aggregate SQL expression", () => {
    expect(SQUAD_SORT.kills.expr).toBe(
      "coalesce(sum((stats.stats->>'kills')::integer), 0)",
    );
  });

  it("maps bounty points to the stored column", () => {
    expect(BOUNTY_SORT.points.expr).toBe("bounty.points");
  });

  it("declares an explicit nullable flag on every whitelist entry", () => {
    const flags = [
      ...Object.values(PLAYER_SORT),
      ...Object.values(SQUAD_SORT),
      ...Object.values(BOUNTY_SORT),
    ].map((entry) => entry.nullable);

    expect(flags).toEqual(flags.map(() => false));
  });
});

describe("resolveSort", () => {
  it("returns the default descriptor when no sort is requested", () => {
    expect(resolveSort(PLAYER_SORT, undefined, PLAYER_SORT_DEFAULT)).toEqual({
      expr: PLAYER_SORT.kills.expr,
      field: "kills",
      numeric: true,
      nullable: false,
    });
  });

  it("returns the requested descriptor when it is whitelisted", () => {
    expect(
      resolveSort(PLAYER_SORT, "teamkills", PLAYER_SORT_DEFAULT),
    ).toEqual({
      expr: PLAYER_SORT.teamkills.expr,
      field: "teamkills",
      numeric: true,
      nullable: false,
    });
  });

  it("resolves the squad default", () => {
    expect(resolveSort(SQUAD_SORT, undefined, SQUAD_SORT_DEFAULT).field).toBe(
      SQUAD_SORT_DEFAULT,
    );
  });

  it("resolves the bounty default", () => {
    expect(resolveSort(BOUNTY_SORT, undefined, BOUNTY_SORT_DEFAULT).field).toBe(
      BOUNTY_SORT_DEFAULT,
    );
  });

  it("rejects an unknown sort field with BadCursorError", () => {
    expect(() =>
      resolveSort(PLAYER_SORT, "deaths", PLAYER_SORT_DEFAULT),
    ).toThrow(BadCursorError);
  });
});
