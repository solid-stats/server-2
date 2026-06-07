/* eslint-disable camelcase, no-magic-numbers, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { mapBounty, type BountyRow } from "./repository.js";

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
      // @ts-expect-error -- exercising a defensive guard against an old/unknown version
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
