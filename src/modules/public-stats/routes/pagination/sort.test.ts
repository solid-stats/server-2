import { describe, expect, it } from "vitest";

import { BadCursorError } from "./errors.js";
import {
  BOUNTY_SORT,
  BOUNTY_SORT_DEFAULT,
  EVENT_PAGE_DEFAULT,
  EVENT_PAGE_MAX,
  EVENT_SORT,
  EVENT_SORT_DEFAULT,
  PLAYER_SORT,
  PLAYER_SORT_DEFAULT,
  REPLAY_SORT,
  REPLAY_SORT_DEFAULT,
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
      castType: "bigint",
      expr: PLAYER_SORT.kills.expr,
      field: "kills",
      numeric: true,
      nullable: false,
    });
  });

  it("returns the requested descriptor when it is whitelisted", () => {
    expect(resolveSort(PLAYER_SORT, "teamkills", PLAYER_SORT_DEFAULT)).toEqual({
      castType: "bigint",
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

// ---------------------------------------------------------------------------
// Phase 17: REPLAY_SORT and EVENT_SORT whitelists
// ---------------------------------------------------------------------------

describe("REPLAY_SORT whitelist", () => {
  it("has a 'date' key pointing to replays.replay_timestamp", () => {
    expect(REPLAY_SORT.date.expr).toBe("replays.replay_timestamp");
  });

  it("REPLAY_SORT.date.nullable is true (replay_timestamp is nullable)", () => {
    expect(REPLAY_SORT.date.nullable).toBe(true);
  });

  it("REPLAY_SORT.date.castType is 'timestamptz' (ISO cursor strings must bind as ::timestamptz)", () => {
    expect(REPLAY_SORT.date.castType).toBe("timestamptz");
  });

  it("REPLAY_SORT.date.numeric is false", () => {
    expect(REPLAY_SORT.date.numeric).toBe(false);
  });

  it("REPLAY_SORT_DEFAULT is 'date'", () => {
    expect(REPLAY_SORT_DEFAULT).toBe("date");
  });

  it("resolves REPLAY_SORT default via resolveSort", () => {
    const resolved = resolveSort(REPLAY_SORT, undefined, REPLAY_SORT_DEFAULT);
    expect(resolved.field).toBe("date");
    expect(resolved.nullable).toBe(true);
  });
});

describe("EVENT_SORT whitelist", () => {
  it("has a 'time' key pointing to events.occurred_at", () => {
    expect(EVENT_SORT.time.expr).toBe("events.occurred_at");
  });

  it("EVENT_SORT.time.nullable is true (occurred_at is nullable)", () => {
    expect(EVENT_SORT.time.nullable).toBe(true);
  });

  it("EVENT_SORT.time.castType is 'timestamptz' (ISO cursor strings must bind as ::timestamptz)", () => {
    expect(EVENT_SORT.time.castType).toBe("timestamptz");
  });

  it("EVENT_SORT.time.numeric is false", () => {
    expect(EVENT_SORT.time.numeric).toBe(false);
  });

  it("EVENT_SORT_DEFAULT is 'time'", () => {
    expect(EVENT_SORT_DEFAULT).toBe("time");
  });

  it("resolves EVENT_SORT default via resolveSort", () => {
    const resolved = resolveSort(EVENT_SORT, undefined, EVENT_SORT_DEFAULT);
    expect(resolved.field).toBe("time");
    expect(resolved.nullable).toBe(true);
  });
});

describe("event page size constants", () => {
  it("EVENT_PAGE_MAX is 200", () => {
    expect(EVENT_PAGE_MAX).toBe(200);
  });

  it("EVENT_PAGE_DEFAULT is 50", () => {
    expect(EVENT_PAGE_DEFAULT).toBe(50);
  });
});
