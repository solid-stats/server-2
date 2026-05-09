/* eslint-disable camelcase */
import { expect, it } from "vitest";

import { calculateBountyPoints } from "../bounty.js";

const FOUR_AND_HALF_POINTS = 4.5,
  TWO_FACTOR = 2,
  HALF_FACTOR = 0.5,
  HIGH_EFFECTIVENESS = 99;

it("Awards enemy kill bounty from previous rotation player and squad effectiveness", () => {
  const result = calculateBountyPoints(
    [
      {
        attackerPlayerId: "attacker",
        eventType: "kill",
        replayId: "replay-1",
        victimPlayerId: "victim",
        victimSquadId: "victim-squad",
      },
    ],
    {
      players: new Map([["victim", { deaths: { total: 2 }, kills: 4 }]]),
      squads: new Map([["victim-squad", { deaths: { total: 4 }, kills: 2 }]]),
    },
  );

  expect(result).toEqual([
    {
      inputs: {
        base_score: 1,
        events: [
          {
            event_type: "kill",
            player_factor: TWO_FACTOR,
            points: FOUR_AND_HALF_POINTS,
            replay_id: "replay-1",
            squad_factor: HALF_FACTOR,
            victim_player_id: "victim",
            victim_squad_id: "victim-squad",
          },
        ],
        total_points: FOUR_AND_HALF_POINTS,
        version: 1,
      },
      playerId: "attacker",
      points: FOUR_AND_HALF_POINTS,
    },
  ]);
});

it("Uses zero factors when previous rotation evidence is missing", () => {
  const result = calculateBountyPoints(
    [
      {
        attackerPlayerId: "attacker",
        eventType: "kill",
        replayId: "replay-1",
        victimPlayerId: "victim",
      },
    ],
    {
      players: new Map(),
      squads: new Map(),
    },
  );

  expect(result).toEqual([
    {
      inputs: {
        base_score: 1,
        events: [
          {
            event_type: "kill",
            player_factor: 0,
            points: 1,
            replay_id: "replay-1",
            squad_factor: 0,
            victim_player_id: "victim",
          },
        ],
        total_points: 1,
        version: 1,
      },
      playerId: "attacker",
      points: 1,
    },
  ]);
});

it("Merges repeated attacker events and sorts rows by attacker player id", () => {
  const result = calculateBountyPoints(
    [
      {
        attackerPlayerId: "bravo",
        eventType: "kill",
        replayId: "replay-1",
        victimPlayerId: "victim",
      },
      {
        attackerPlayerId: "alpha",
        eventType: "kill",
        replayId: "replay-2",
        victimPlayerId: "victim",
      },
      {
        attackerPlayerId: "bravo",
        eventType: "kill",
        replayId: "replay-3",
        victimPlayerId: "victim",
      },
    ],
    {
      players: new Map(),
      squads: new Map(),
    },
  );

  expect(result.map((row) => [row.playerId, row.points])).toEqual([
    ["alpha", 1],
    ["bravo", 2],
  ]);
});

it("Records zero point exclusions for teamkills and non-enemy kills", () => {
  const result = calculateBountyPoints(
    [
      {
        attackerPlayerId: "attacker",
        eventType: "teamkill",
        replayId: "replay-1",
        victimPlayerId: "victim",
        victimSquadId: "victim-squad",
      },
      {
        attackerPlayerId: "attacker",
        eventType: "unknown_kill",
        replayId: "replay-2",
        victimPlayerId: "victim",
      },
    ],
    {
      players: new Map([
        ["victim", { deaths: { total: 1 }, kills: HIGH_EFFECTIVENESS }],
      ]),
      squads: new Map([
        ["victim-squad", { deaths: { total: 1 }, kills: HIGH_EFFECTIVENESS }],
      ]),
    },
  );

  expect(result).toEqual([
    {
      inputs: {
        base_score: 1,
        events: [
          {
            event_type: "teamkill",
            excluded_reason: "teamkill",
            points: 0,
            replay_id: "replay-1",
            victim_player_id: "victim",
            victim_squad_id: "victim-squad",
          },
          {
            event_type: "unknown_kill",
            excluded_reason: "non_enemy_kill",
            points: 0,
            replay_id: "replay-2",
            victim_player_id: "victim",
          },
        ],
        total_points: 0,
        version: 1,
      },
      playerId: "attacker",
      points: 0,
    },
  ]);
});

it("Records missing victim evidence for unresolved enemy kills", () => {
  const result = calculateBountyPoints(
    [
      {
        attackerPlayerId: "attacker",
        eventType: "kill",
        replayId: "replay-1",
      },
    ],
    {
      players: new Map(),
      squads: new Map(),
    },
  );

  expect(result[0]?.inputs.events).toEqual([
    {
      event_type: "kill",
      excluded_reason: "missing_victim",
      points: 0,
      replay_id: "replay-1",
    },
  ]);
});
