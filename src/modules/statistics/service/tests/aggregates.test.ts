/* eslint-disable camelcase, max-lines-per-function, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { calculatePlayerAndSquadAggregates } from "../service.js";

describe("calculatePlayerAndSquadAggregates", () => {
  it("calculates player and squad kills, teamkills, deaths, and replay counts", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
          {
            eventType: "teamkill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 303 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a", squadId: "squad-a" },
          { entityRef: "202", playerId: "player-b", squadId: "squad-b" },
          { entityRef: "303", playerId: "player-c" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(result.playerStats).toEqual([
      {
        playerId: "player-a",
        stats: {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 1,
          replay_count: 1,
          teamkills: 1,
          version: 1,
        },
      },
      {
        playerId: "player-b",
        stats: {
          deaths: { by_teamkills: 0, total: 1 },
          kills: 0,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
      {
        playerId: "player-c",
        stats: {
          deaths: { by_teamkills: 1, total: 1 },
          kills: 0,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
    ]);
    expect(result.squadStats).toEqual([
      {
        squadId: "squad-a",
        stats: {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 1,
          player_count: 1,
          replay_count: 1,
          teamkills: 1,
          version: 1,
        },
      },
      {
        squadId: "squad-b",
        stats: {
          deaths: { by_teamkills: 0, total: 1 },
          kills: 0,
          player_count: 1,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
    ]);
  });

  it("ignores unknown players, diagnostics, and missing squad evidence", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "destroyed_vehicle",
            observedPlayerRef: "101",
            payload: {},
            sourceRef: {},
          },
          {
            eventType: "diagnostic",
            observedPlayerRef: null,
            payload: {},
            sourceRef: {},
          },
          {
            eventType: "unknown_kill",
            observedPlayerRef: "missing",
            payload: { victim_entity_id: 101 },
            sourceRef: {},
          },
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: {},
            sourceRef: {},
          },
          {
            eventType: "teamkill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 999 },
            sourceRef: {},
          },
        ],
        players: [{ entityRef: "101", playerId: "player-a" }],
        replayId: "replay-1",
      },
    ]);

    expect(result).toEqual({
      playerStats: [
        {
          playerId: "player-a",
          stats: {
            deaths: { by_teamkills: 0, total: 1 },
            kills: 1,
            replay_count: 1,
            teamkills: 1,
            version: 1,
          },
        },
      ],
      squadStats: [],
    });
  });
});
