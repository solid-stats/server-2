/* eslint-disable camelcase, id-length, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "../../repository.js";

import type { Pool, PoolClient } from "pg";

class ScriptedClient {
  public readonly queries: string[] = [];

  public released = false;

  public constructor(
    private readonly options: {
      emptyParserResults?: boolean;
      failOn?: string;
      missingReplayTimestamp?: boolean;
      missingRotation?: boolean;
      withMembership?: boolean;
    } = {},
  ) {}

  public query(sql: string): Promise<{ rows: unknown[] }> {
    const normalizedSql = sql.trim();
    this.queries.push(normalizedSql);
    if (
      this.options.failOn !== undefined &&
      normalizedSql.startsWith(this.options.failOn)
    ) {
      return Promise.reject(new Error("scripted failure"));
    }
    return Promise.resolve({ rows: this.rowsFor(normalizedSql) });
  }

  public release(): void {
    this.released = true;
  }

  private rowsFor(sql: string): unknown[] {
    if (sql.startsWith("select r.id as replay_id")) {
      return [
        {
          replay_id: "replay-1",
          replay_timestamp:
            this.options.missingReplayTimestamp === true ? null : new Date(0),
        },
      ];
    }
    if (sql.startsWith("select id")) {
      if (this.options.missingRotation === true) {
        return [];
      }
      return [{ id: "rotation-1" }];
    }
    if (sql.startsWith("select pr.id")) {
      if (this.options.emptyParserResults === true) {
        return [];
      }
      return [
        {
          id: "result-1",
          raw_snapshot: {
            contract_version: "3.0.0",
            parser: {},
            players: [
              { eid: 101, n: "Known", sid: "steam-1" },
              { eid: 202, n: "Unknown" },
            ],
            source: {},
            status: "success",
          },
          replay_id: "replay-1",
          replay_timestamp: new Date(0),
        },
        {
          id: "result-2",
          raw_snapshot: {
            contract_version: "3.0.0",
            parser: {},
            source: {},
            status: "success",
          },
          replay_id: "replay-2",
          replay_timestamp: new Date(0),
        },
      ];
    }
    if (sql.startsWith("select parser_result_id")) {
      return [
        eventRow("diagnostic", null),
        eventRow("destroyed_vehicle", null),
        eventRow("kill", null),
        eventRow("unsupported", "101"),
        eventRow("teamkill", "101"),
      ];
    }
    if (sql.startsWith("select cp.id as player_id")) {
      return [
        {
          display_name: "Known",
          player_id: "player-1",
          steam_id: "steam-1",
        },
      ];
    }
    if (
      sql.startsWith("select distinct sm.player_id") &&
      this.options.withMembership === true
    ) {
      return [{ player_id: "player-1", squad_id: "squad-1" }];
    }
    return [];
  }
}

describe("PgStatisticsRepository", () => {
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

  it("maps database rows and commits aggregate recalculation", async () => {
    const client = new ScriptedClient({ withMembership: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toEqual({
      playerStats: 1,
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
      playerStats: 1,
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

function eventRow(
  eventType: string,
  observedPlayerReference: string | null,
): unknown {
  return {
    event_type: eventType,
    observed_player_ref: observedPlayerReference,
    parser_result_id: "result-1",
    payload: { victim_entity_id: 202 },
    source_ref: {},
  };
}

function poolFor(client: ScriptedClient): Pool {
  return {
    connect: () => Promise.resolve(client as unknown as PoolClient),
  } as unknown as Pool;
}
