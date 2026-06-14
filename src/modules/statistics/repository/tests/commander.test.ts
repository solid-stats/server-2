/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "../repository.js";

import {
  ScriptedClient,
  commanderInsertParameters,
  poolFor,
} from "./utilities.js";

describe("PgStatisticsRepository commander side fact mapping", () => {
  // These mapping tests use auditGameType 'mace' so the audit path runs exactly
  // ONE scope (mace is all-time-only per D1), keeping commanderStats at 1 and the
  // single insert keyed (rotation_id NULL, game_type 'mace'). The commander
  // identity/outcome mapping under test is independent of game type. The sg case
  // (per-rotation + all-time, two scopes) is covered in the real-pg harness.
  it("maps commander side facts and commits commander aggregate recalculation", async () => {
    const client = new ScriptedClient({ auditGameType: "mace" }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toEqual({
      commanderStats: 1,
      rotationId: "rotation-1",
      status: "recalculated",
    });

    expect(client.queries).toContain("commit");
    expect(commanderInsertParameters(client)).toEqual([
      [null, "player-1", "west", 1, 0, 0, "mace"],
    ]);
  });

  it("matches commander player identity by observed name when source entity id is absent", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        commanderScenario: "nameOnly",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toMatchObject({
      commanderStats: 1,
      status: "recalculated",
    });

    expect(commanderInsertParameters(client)).toEqual([
      [null, "player-1", "west", 1, 0, 0, "mace"],
    ]);
  });

  it("matches commander player identity by display name when Steam id is absent", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        commanderScenario: "playerNameOnly",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toMatchObject({
      commanderStats: 1,
      status: "recalculated",
    });

    expect(commanderInsertParameters(client)).toEqual([
      [null, "player-1", "west", 1, 0, 0, "mace"],
    ]);
  });

  it("keeps side aggregate anonymous when commander actor is unknown", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        commanderScenario: "unknownActor",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toMatchObject({
      commanderStats: 1,
      status: "recalculated",
    });

    expect(commanderInsertParameters(client)).toEqual([
      [null, null, "west", 1, 0, 0, "mace"],
    ]);
  });

  it("counts commander outcome as unknown when side facts omit outcome", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        commanderScenario: "missingOutcome",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toMatchObject({
      commanderStats: 1,
      status: "recalculated",
    });

    expect(commanderInsertParameters(client)).toEqual([
      [null, "player-1", "west", 0, 0, 1, "mace"],
    ]);
  });

  it("counts commander outcome as unknown when winner side is not present", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        commanderScenario: "unknownWinner",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toMatchObject({
      commanderStats: 1,
      status: "recalculated",
    });

    expect(commanderInsertParameters(client)).toEqual([
      [null, "player-1", "west", 0, 0, 1, "mace"],
    ]);
  });
});

describe("PgStatisticsRepository commander recalculation lifecycle", () => {
  it("commits missing rotation result for commander aggregate recalculation", async () => {
    const client = new ScriptedClient({ missingRotation: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toEqual({
      commanderStats: 0,
      rotationId: null,
      status: "missing_rotation",
    });
  });

  it("commits missing timestamp result for commander aggregate recalculation", async () => {
    const client = new ScriptedClient({ missingReplayTimestamp: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toEqual({
      commanderStats: 0,
      rotationId: null,
      status: "missing_replay_timestamp",
    });
  });

  it("rolls back and releases the client when commander recalculation fails", async () => {
    const client = new ScriptedClient({
        failOn: "delete from commander_side_stats",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).rejects.toThrow("scripted failure");

    expect(client.queries).toContain("rollback");
    expect(client.released).toBe(true);
  });

  it("commits empty commander aggregate recalculation when rotation has no current parser results", async () => {
    const client = new ScriptedClient({ emptyParserResults: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateCommanderSideStatsForParserResult("result-1"),
    ).resolves.toEqual({
      commanderStats: 0,
      rotationId: "rotation-1",
      status: "recalculated",
    });
  });
});
