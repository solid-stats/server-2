/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "../repository.js";

import { ScriptedClient, poolFor } from "./utilities.js";

describe("PgStatisticsRepository parser event persistence", () => {
  it("commits event replacement when inserts succeed", async () => {
    const client = new ScriptedClient(),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.replaceParserEvents("result-1", [
        {
          eventType: "kill",
          observedPlayerRef: "101",
          payload: {},
          sourceRef: {},
        },
      ]),
    ).resolves.toBeUndefined();

    expect(client.queries).toContain("commit");
  });

  it("rolls back and releases the client when event replacement fails", async () => {
    const client = new ScriptedClient({ failOn: "insert into parser_events" }),
      pool = poolFor(client),
      repository = new PgStatisticsRepository(pool);

    await expect(
      repository.replaceParserEvents("result-1", [
        {
          eventType: "kill",
          observedPlayerRef: "101",
          payload: {},
          sourceRef: {},
        },
      ]),
    ).rejects.toThrow("scripted failure");

    expect(client.queries).toEqual([
      "begin",
      "delete from parser_events where parser_result_id = $1",
      "insert into parser_events (\n          parser_result_id, event_type, observed_player_ref, payload, source_ref\n        )\n        values ($1, $2, $3, $4, $5)",
      "rollback",
    ]);
    expect(client.released).toBe(true);
  });

  it("rolls back and releases the client when aggregate recalculation fails", async () => {
    const client = new ScriptedClient({ failOn: "select r.id as replay_id" }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).rejects.toThrow("scripted failure");

    expect(client.queries).toEqual([
      "begin",
      "select r.id as replay_id, r.replay_timestamp\n      from parser_results pr\n      join replays r on r.id = pr.replay_id\n      where pr.id = $1",
      "rollback",
    ]);
    expect(client.released).toBe(true);
  });

  it("rolls back when fallback identity insert does not return an id", async () => {
    const client = new ScriptedClient({ missingInsertedPlayerId: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).rejects.toThrow("canonical player fallback insert did not return id");

    expect(client.queries).toContain("rollback");
    expect(client.released).toBe(true);
  });

  it("ignores stored parser event rows without attacker references", async () => {
    const client = new ScriptedClient({ nullKillAttacker: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 2,
      rotationId: "rotation-1",
      squadStats: 0,
      status: "recalculated",
    });
  });
});

describe("PgStatisticsRepository aggregate recalculation", () => {
  it("maps database rows and commits aggregate recalculation", async () => {
    const client = new ScriptedClient({ withMembership: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 2,
      rotationId: "rotation-1",
      squadStats: 1,
      status: "recalculated",
    });

    expect(client.queries).toContain("commit");
    expect(client.released).toBe(true);
  });

  it("maps database rows without squad membership evidence", async () => {
    const client = new ScriptedClient(),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 2,
      rotationId: "rotation-1",
      squadStats: 0,
      status: "recalculated",
    });
  });

  it("commits missing timestamp result without aggregate writes", async () => {
    const client = new ScriptedClient({ missingReplayTimestamp: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId: null,
      squadStats: 0,
      status: "missing_replay_timestamp",
    });

    expect(client.queries).toContain("commit");
  });

  it("commits missing rotation result without aggregate writes", async () => {
    const client = new ScriptedClient({ missingRotation: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId: null,
      squadStats: 0,
      status: "missing_rotation",
    });

    expect(client.queries).toContain("commit");
  });

  it("commits empty aggregate recalculation when rotation has no current parser results", async () => {
    const client = new ScriptedClient({ emptyParserResults: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId: "rotation-1",
      squadStats: 0,
      status: "recalculated",
    });

    expect(client.queries).toContain("commit");
  });
});
