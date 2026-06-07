/* eslint-disable max-lines, new-cap, unicorn/no-zero-fractions */
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  PlayerRelationshipsResponse,
  PlayerStatsResponse,
  PlayerVehiclesResponse,
  PlayerWeaponsResponse,
  PlayerWeeklyResponse,
  SquadRelationshipsResponse,
  SquadStatsResponse,
  SquadWeaponsResponse,
  SquadWeeklyResponse,
} from "../routes/schemas.js";

// TypeBox Value.Check does not register format validators by default.
// Register `uuid` so format: "uuid" fields are validated correctly.
FormatRegistry.Set("uuid", (value) =>
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value),
);

describe("PlayerStatsResponse schema", () => {
  it("accepts kdRatio, totalScore, totalPlayedGames fields", () => {
    const valid = {
      deaths: { byTeamkills: 0, total: 1 },
      kdRatio: 3.0,
      kills: 3,
      replayCount: 2,
      teamkills: 0,
      totalPlayedGames: 2,
      totalScore: 3,
    };
    expect(Value.Check(PlayerStatsResponse, valid)).toBe(true);
  });

  it("rejects missing kdRatio", () => {
    const invalid = {
      deaths: { byTeamkills: 0, total: 1 },
      kills: 3,
      replayCount: 2,
      teamkills: 0,
      totalPlayedGames: 2,
      totalScore: 3,
    };
    expect(Value.Check(PlayerStatsResponse, invalid)).toBe(false);
  });
});

describe("PlayerWeaponsResponse schema", () => {
  it("accepts firearms and vehicles arrays", () => {
    const valid = {
      firearms: [{ kills: 5, name: "M4" }],
      vehicles: [{ kills: 2, name: "T72" }],
    };
    expect(Value.Check(PlayerWeaponsResponse, valid)).toBe(true);
  });

  it("accepts empty arrays", () => {
    const valid = { firearms: [], vehicles: [] };
    expect(Value.Check(PlayerWeaponsResponse, valid)).toBe(true);
  });
});

describe("PlayerVehiclesResponse schema", () => {
  it("accepts vehicle counters and vehicles list", () => {
    const valid = {
      killsFromVehicle: 2,
      killsFromVehicleCoef: 0.5,
      vehicleKills: 3,
      vehicles: [{ kills: 1, name: "MRAP" }],
    };
    expect(Value.Check(PlayerVehiclesResponse, valid)).toBe(true);
  });
});

describe("PlayerRelationshipsResponse schema", () => {
  it("accepts four lists of player-count entries without steamId", () => {
    const entry = {
      count: 3,
      player: {
        displayName: "Alpha",
        id: "00000000-0000-4000-8000-000000000601",
      },
    };
    const valid = {
      killed: [entry],
      killers: [],
      teamkilled: [],
      teamkillers: [],
    };
    expect(Value.Check(PlayerRelationshipsResponse, valid)).toBe(true);
  });

  it("relationship player reference has no steamId property in schema", () => {
    // The PlayerRelationshipEntry player object only has id+displayName —
    // no steamId field is declared. We verify by checking that the schema
    // accepts the exact {id, displayName} shape (no steam fields needed).
    const minimalEntry = {
      count: 3,
      player: {
        displayName: "Alpha",
        id: "00000000-0000-4000-8000-000000000601",
      },
    };
    expect(
      Value.Check(PlayerRelationshipsResponse, {
        killed: [minimalEntry],
        killers: [],
        teamkilled: [],
        teamkillers: [],
      }),
    ).toBe(true);
  });

  it("accepts a non-UUID relationship target id (unresolved player ref)", () => {
    // The relationshipsSql COALESCE chain can emit a raw player name or
    // in-replay ref when a kill victim/killer does not resolve to a canonical
    // player. The byte-identical parity invariant requires keeping these
    // entries, so the schema must NOT reject a non-UUID id.
    const unresolvedEntry = {
      count: 1,
      player: {
        displayName: "Unresolved Victim",
        id: "in-replay-ref:42",
      },
    };
    expect(
      Value.Check(PlayerRelationshipsResponse, {
        killed: [unresolvedEntry],
        killers: [],
        teamkilled: [],
        teamkillers: [],
      }),
    ).toBe(true);
  });
});

describe("SquadStatsResponse schema", () => {
  it("accepts kdRatio, totalScore, totalPlayedGames alongside existing squad fields", () => {
    const valid = {
      deaths: { byTeamkills: 1, total: 2 },
      kdRatio: 2.5,
      kills: 5,
      playerCount: 2,
      replayCount: 3,
      teamkills: 1,
      totalPlayedGames: 3,
      totalScore: 4,
    };
    expect(Value.Check(SquadStatsResponse, valid)).toBe(true);
  });

  it("rejects missing kdRatio on squad stats", () => {
    const invalid = {
      deaths: { byTeamkills: 1, total: 2 },
      kills: 5,
      playerCount: 2,
      replayCount: 3,
      teamkills: 1,
    };
    expect(Value.Check(SquadStatsResponse, invalid)).toBe(false);
  });
});

describe("SquadWeaponsResponse schema", () => {
  it("accepts firearms and vehicles arrays (member-aggregate)", () => {
    const valid = {
      firearms: [{ kills: 5, name: "Rifle" }],
      vehicles: [{ kills: 2, name: "RPG" }],
    };
    expect(Value.Check(SquadWeaponsResponse, valid)).toBe(true);
  });

  it("accepts empty arrays", () => {
    expect(
      Value.Check(SquadWeaponsResponse, { firearms: [], vehicles: [] }),
    ).toBe(true);
  });
});

describe("SquadRelationshipsResponse schema", () => {
  it("accepts four lists of {player:{id,displayName}, count} entries", () => {
    const entry = {
      count: 3,
      player: {
        displayName: "Alpha",
        id: "00000000-0000-4000-8000-000000000601",
      },
    };
    const valid = {
      killed: [entry],
      killers: [],
      teamkilled: [],
      teamkillers: [],
    };
    expect(Value.Check(SquadRelationshipsResponse, valid)).toBe(true);
  });

  it("accepts a non-UUID relationship target id (unresolved player ref)", () => {
    const unresolvedEntry = {
      count: 1,
      player: {
        displayName: "Unresolved Victim",
        id: "in-replay-ref:42",
      },
    };
    expect(
      Value.Check(SquadRelationshipsResponse, {
        killed: [unresolvedEntry],
        killers: [],
        teamkilled: [],
        teamkillers: [],
      }),
    ).toBe(true);
  });
});

describe("SquadWeeklyResponse schema", () => {
  it("accepts weeks array reusing PlayerWeekBucket form (totalPlayedGames present)", () => {
    const valid = {
      weeks: [
        {
          deaths: { byTeamkills: 0, total: 1 },
          endDate: "2026-05-14T23:59:59.999Z",
          kdRatio: 3.0,
          killsFromVehicle: 0,
          killsFromVehicleCoef: 0,
          kills: 3,
          score: 1.5,
          startDate: "2026-05-09T00:00:00.000Z",
          teamkills: 0,
          totalPlayedGames: 1,
          vehicleKills: 0,
          week: "2026-19",
        },
      ],
    };
    expect(Value.Check(SquadWeeklyResponse, valid)).toBe(true);
  });

  it("rejects week bucket missing totalPlayedGames", () => {
    const invalid = {
      weeks: [
        {
          deaths: { byTeamkills: 0, total: 1 },
          endDate: "2026-05-14T23:59:59.999Z",
          kdRatio: 3.0,
          killsFromVehicle: 0,
          killsFromVehicleCoef: 0,
          kills: 3,
          score: 1.5,
          startDate: "2026-05-09T00:00:00.000Z",
          teamkills: 0,
          vehicleKills: 0,
          week: "2026-19",
        },
      ],
    };
    expect(Value.Check(SquadWeeklyResponse, invalid)).toBe(false);
  });
});

describe("PlayerWeeklyResponse schema", () => {
  it("accepts weeks array with totalPlayedGames in each bucket", () => {
    const valid = {
      weeks: [
        {
          deaths: { byTeamkills: 0, total: 1 },
          endDate: "2026-05-14T23:59:59.999Z",
          kdRatio: 3.0,
          killsFromVehicle: 0,
          killsFromVehicleCoef: 0,
          kills: 3,
          score: 1.5,
          startDate: "2026-05-09T00:00:00.000Z",
          teamkills: 0,
          totalPlayedGames: 2,
          vehicleKills: 0,
          week: "2026-19",
        },
      ],
    };
    expect(Value.Check(PlayerWeeklyResponse, valid)).toBe(true);
  });

  it("rejects week bucket missing totalPlayedGames", () => {
    const invalid = {
      weeks: [
        {
          deaths: { byTeamkills: 0, total: 1 },
          endDate: "2026-05-14T23:59:59.999Z",
          kdRatio: 3.0,
          killsFromVehicle: 0,
          killsFromVehicleCoef: 0,
          kills: 3,
          score: 1.5,
          startDate: "2026-05-09T00:00:00.000Z",
          teamkills: 0,
          vehicleKills: 0,
          week: "2026-19",
        },
      ],
    };
    expect(Value.Check(PlayerWeeklyResponse, invalid)).toBe(false);
  });
});
