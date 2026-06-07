/* eslint-disable camelcase, max-lines, no-magic-numbers, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  mapBounty,
  PgPublicStatsReadModel,
  type BountyRow,
} from "./repository.js";

import type { RotationFilters } from "./routes/models.js";
import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// API-03 — listCommanderSides side/rotation predicate composition (SQL build)
// ---------------------------------------------------------------------------
//
// The `?side=` filter must compose with the existing `?rotationId` predicate via
// AND, bind every value as `$n` (never interpolate), keep the `::text` cast on
// side, and preserve the ordering clause byte-for-byte. We capture the generated
// SQL + bound values through a pool stub instead of a live DB.

interface CapturedQuery {
  sql: string;
  values: readonly unknown[];
}

function readModelWithCapture(): {
  captured: CapturedQuery[];
  readModel: PgPublicStatsReadModel;
} {
  const captured: CapturedQuery[] = [],
    poolStub = {
      query: (sql: string, values: readonly unknown[]) => {
        captured.push({ sql, values });
        return Promise.resolve({ rows: [] });
      },
    } as unknown as Pool;
  return { captured, readModel: new PgPublicStatsReadModel(poolStub) };
}

const ROTATION_ID = "33333333-3333-3333-3333-333333333333",
  ORDER_CLAUSE =
    "order by commander.rotation_id desc, commander.side, players.display_name nulls last";

async function captureCommanderSidesSql(
  filters: RotationFilters,
): Promise<CapturedQuery> {
  const { captured, readModel } = readModelWithCapture();
  await readModel.listCommanderSides(filters);
  const [query] = captured;
  if (query === undefined) {
    throw new Error("listCommanderSides did not issue a query");
  }
  return query;
}

describe("listCommanderSides side filter", () => {
  it("builds no side predicate and binds zero values when filters are empty", async () => {
    const { sql, values } = await captureCommanderSidesSql({});

    expect(sql).not.toContain("commander.side =");
    expect(sql).not.toContain("where");
    expect(values).toEqual([]);
    expect(sql).toContain(ORDER_CLAUSE);
  });

  it("composes a parameterized side predicate when only side is set", async () => {
    const { sql, values } = await captureCommanderSidesSql({ side: "west" });

    expect(sql).toContain("where commander.side = $1::text");
    expect(values).toEqual(["west"]);
    expect(sql).toContain(ORDER_CLAUSE);
  });

  it("composes rotationId AND side with ordered bindings", async () => {
    const { sql, values } = await captureCommanderSidesSql({
      rotationId: ROTATION_ID,
      side: "east",
    });

    expect(sql).toContain(
      "where commander.rotation_id = $1 and commander.side = $2::text",
    );
    expect(values).toEqual([ROTATION_ID, "east"]);
    expect(sql).toContain(ORDER_CLAUSE);
  });

  it("preserves the ordering clause when only rotationId is set", async () => {
    const { sql, values } = await captureCommanderSidesSql({
      rotationId: ROTATION_ID,
    });

    expect(sql).toContain("where commander.rotation_id = $1");
    expect(sql).not.toContain("commander.side =");
    expect(values).toEqual([ROTATION_ID]);
    expect(sql).toContain(ORDER_CLAUSE);
  });
});

// ---------------------------------------------------------------------------
// API-02 — mapBounty breakdown folding (pure mapper, no DB)
// ---------------------------------------------------------------------------
//
// mapBounty reads the stored `bounty_points.inputs` jsonb at the mapper boundary
// and folds it into an additive, optional `breakdown` aggregate. No recomputation,
// no formula change, no victim ids. Legacy/null/old-version rows -> breakdown: null.

function bountyRowWithInputs(inputs: BountyRow["inputs"]): BountyRow {
  return {
    display_name: "Alpha",
    id: "11111111-1111-1111-1111-111111111111",
    inputs,
    player_id: "22222222-2222-2222-2222-222222222222",
    points: "3.50",
    rotation_id: "33333333-3333-3333-3333-333333333333",
  };
}

describe("mapBounty breakdown", () => {
  it("folds counted-kill events into an aggregate breakdown", () => {
    const row = bountyRowWithInputs({
      base_score: 1,
      events: [
        {
          event_type: "kill",
          player_factor: 0.5,
          points: 1.65,
          replay_id: "r1",
          squad_factor: 0.1,
          victim_player_id: "v1",
        },
        {
          event_type: "kill",
          player_factor: 0.25,
          points: 1.5,
          replay_id: "r2",
          squad_factor: 0.2,
          victim_player_id: "v2",
        },
        {
          event_type: "teamkill",
          excluded_reason: "teamkill",
          points: 0,
          replay_id: "r3",
        },
      ],
      total_points: 3.15,
      version: 1,
    });

    const summary = mapBounty(row);

    expect(summary.breakdown).toEqual({
      baseScore: 2,
      countedKills: 2,
      squadEffectiveness: 0.3,
      victimEffectiveness: 0.75,
    });
  });

  it("returns breakdown: null when inputs is null (legacy row)", () => {
    const row = bountyRowWithInputs(null);

    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("returns breakdown: null when inputs.version !== 1", () => {
    const row = bountyRowWithInputs({
      base_score: 1,
      events: [],
      total_points: 0,
      version: 2,
    });

    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("ignores excluded-arm events (no player_factor/squad_factor)", () => {
    const row = bountyRowWithInputs({
      base_score: 1,
      events: [
        {
          event_type: "kill",
          player_factor: 0.4,
          points: 1.4,
          replay_id: "r1",
          squad_factor: 0,
          victim_player_id: "v1",
        },
        {
          event_type: "teamkill",
          excluded_reason: "teamkill",
          points: 0,
          replay_id: "r2",
        },
        {
          event_type: "unknown_kill",
          excluded_reason: "non_enemy_kill",
          points: 0,
          replay_id: "r3",
        },
      ],
      total_points: 1.4,
      version: 1,
    });

    expect(mapBounty(row).breakdown).toEqual({
      baseScore: 1,
      countedKills: 1,
      squadEffectiveness: 0,
      victimEffectiveness: 0.4,
    });
  });
});

// ---------------------------------------------------------------------------
// CR-01 / WR-01 / WR-02 — malformed untrusted jsonb must fold to breakdown: null
// ---------------------------------------------------------------------------
//
// `bounty_points.inputs` is untrusted jsonb; its TS type is a compile-time
// assertion only. A version-1 row whose `events` is missing/null/non-array, or
// whose numeric fields are strings/null, must NOT crash the public route or emit
// NaN — it must fall back to the documented legacy `null`. These rows model what
// the DB can actually return, so they bypass the strict type via an unknown cast.

function bountyRowWithRawInputs(rawInputs: unknown): BountyRow {
  return bountyRowWithInputs(rawInputs as BountyRow["inputs"]);
}

describe("mapBounty breakdown — malformed untrusted jsonb", () => {
  it("returns breakdown: null when version-1 row has no events key (CR-01)", () => {
    const row = bountyRowWithRawInputs({ base_score: 1, version: 1 });

    expect(() => mapBounty(row)).not.toThrow();
    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("returns breakdown: null when version-1 events is null (CR-01)", () => {
    const row = bountyRowWithRawInputs({
      base_score: 1,
      events: null,
      version: 1,
    });

    expect(() => mapBounty(row)).not.toThrow();
    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("returns breakdown: null when version-1 events is a non-array object (CR-01)", () => {
    const row = bountyRowWithRawInputs({
      base_score: 1,
      events: {},
      version: 1,
    });

    expect(() => mapBounty(row)).not.toThrow();
    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("returns breakdown: null when base_score is non-numeric (WR-02)", () => {
    const row = bountyRowWithRawInputs({
      base_score: "1",
      events: [],
      version: 1,
    });

    expect(mapBounty(row).breakdown).toBeNull();
  });

  it("skips counted-kill events whose factors are non-numeric (WR-01)", () => {
    const row = bountyRowWithRawInputs({
      base_score: 1,
      events: [
        {
          event_type: "kill",
          player_factor: "0.5",
          points: 1.65,
          replay_id: "r1",
          squad_factor: 0.1,
          victim_player_id: "v1",
        },
        {
          event_type: "kill",
          player_factor: 0.25,
          points: 1.5,
          replay_id: "r2",
          squad_factor: 0.2,
          victim_player_id: "v2",
        },
      ],
      version: 1,
    });

    // The string-factor event is excluded; only the well-formed event counts,
    // and no NaN leaks into the summed/rounded factors.
    expect(mapBounty(row).breakdown).toEqual({
      baseScore: 1,
      countedKills: 1,
      squadEffectiveness: 0.2,
      victimEffectiveness: 0.25,
    });
  });

  it("does not throw when an event is a non-object primitive (CR-01)", () => {
    const row = bountyRowWithRawInputs({
      base_score: 1,
      events: [null, 42, "kill"],
      version: 1,
    });

    expect(() => mapBounty(row)).not.toThrow();
    expect(mapBounty(row).breakdown).toEqual({
      baseScore: 0,
      countedKills: 0,
      squadEffectiveness: 0,
      victimEffectiveness: 0,
    });
  });
});
