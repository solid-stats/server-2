/* eslint-disable camelcase, max-lines, max-lines-per-function, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  type AggregateReplayInput,
  calculatePlayerAndSquadAggregates,
} from "../service.js";

function twoDeathEventsReplay(replayId: string): AggregateReplayInput {
  return {
    events: [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: {},
      },
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: {},
      },
    ],
    players: [
      { entityRef: "101", playerId: "player-a" },
      { entityRef: "202", playerId: "player-b" },
    ],
    replayId,
  };
}

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

  it("caps compact counter deaths at one per game and uses kill rows as fallback", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "player_counter",
            observedPlayerRef: "202",
            payload: {
              deaths_by_teamkills: 1,
              deaths_total: 3,
              null_killer_deaths: 1,
              suicides: 1,
              unknown_deaths: 1,
            },
            sourceRef: {},
          },
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
          {
            eventType: "teamkill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 303 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a", squadId: "squad-a" },
          { entityRef: "202", playerId: "player-b", squadId: "squad-b" },
          { entityRef: "303", playerId: "player-c", squadId: "squad-c" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(result.playerStats).toEqual([
      {
        playerId: "player-a",
        stats: {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 2,
          replay_count: 1,
          teamkills: 1,
          version: 1,
        },
      },
      {
        playerId: "player-b",
        stats: {
          deaths: { by_teamkills: 1, total: 1 },
          kills: 0,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
      {
        playerId: "player-c",
        stats: {
          deaths: { by_teamkills: 0, total: 1 },
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
          kills: 2,
          player_count: 1,
          replay_count: 1,
          teamkills: 1,
          version: 1,
        },
      },
      {
        squadId: "squad-b",
        stats: {
          deaths: { by_teamkills: 1, total: 1 },
          kills: 0,
          player_count: 1,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
      {
        squadId: "squad-c",
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

  it("caps a lone counter's deaths_total magnitude at one death with no competing kill row", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "player_counter",
            observedPlayerRef: "202",
            payload: { deaths_total: 3 },
            sourceRef: {},
          },
        ],
        players: [{ entityRef: "202", playerId: "player-b" }],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 1 });
  });

  it("Ignores unusable counter death evidence without blocking fallback deaths", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "player_counter",
            observedPlayerRef: "missing",
            payload: { deaths_total: 2 },
            sourceRef: {},
          },
          {
            eventType: "player_counter",
            observedPlayerRef: "202",
            payload: { kills: 1 },
            sourceRef: {},
          },
          {
            eventType: "player_counter",
            observedPlayerRef: "303",
            payload: { deaths_by_teamkills: 2 },
            sourceRef: {},
          },
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
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
          teamkills: 0,
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
          teamkills: 0,
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

  it("caps three death events in one replay at a single death (one-life model)", () => {
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
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a", squadId: "squad-a" },
          { entityRef: "202", playerId: "player-b", squadId: "squad-b" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 1 });
    expect(
      result.squadStats.find((squad) => squad.squadId === "squad-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 1 });
  });

  it("caps a player's teamkill death at one byTeamkills per replay", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "teamkill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
          {
            eventType: "teamkill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a", squadId: "squad-a" },
          { entityRef: "202", playerId: "player-b", squadId: "squad-b" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 1, total: 1 });
    expect(
      result.squadStats.find((squad) => squad.squadId === "squad-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 1, total: 1 });
  });

  it("counts deaths once per replay across multiple replays a player died in", () => {
    const result = calculatePlayerAndSquadAggregates([
      twoDeathEventsReplay("replay-1"),
      twoDeathEventsReplay("replay-2"),
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 2 });
  });

  it("contributes zero deaths for a player who did not die", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "kill",
            observedPlayerRef: "101",
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a" },
          { entityRef: "202", playerId: "player-b" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-a")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 0 });
  });

  it("counts no death for a counter that explicitly reports zero deaths", () => {
    const result = calculatePlayerAndSquadAggregates([
      {
        events: [
          {
            eventType: "player_counter",
            observedPlayerRef: "202",
            payload: { deaths_by_teamkills: 0, deaths_total: 0 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "202", playerId: "player-b", squadId: "squad-b" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 0 });
    expect(
      result.squadStats.find((squad) => squad.squadId === "squad-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 0, total: 0 });
  });

  it("caps byTeamkills below total when a player has both a normal and a teamkill death in one replay", () => {
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
            payload: { victim_entity_id: 202 },
            sourceRef: {},
          },
        ],
        players: [
          { entityRef: "101", playerId: "player-a" },
          { entityRef: "202", playerId: "player-b" },
        ],
        replayId: "replay-1",
      },
    ]);

    expect(
      result.playerStats.find((player) => player.playerId === "player-b")?.stats
        .deaths,
    ).toEqual({ by_teamkills: 1, total: 1 });
  });
});
