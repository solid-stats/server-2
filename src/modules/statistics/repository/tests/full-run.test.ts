/* eslint-disable camelcase, id-length, max-lines-per-function, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgFullRunStatisticsRepository } from "../full-run.js";

import type { Pool } from "pg";

describe("PgFullRunStatisticsRepository", () => {
  it("Maps lifecycle counts with zero defaults and preserved unknown states", async () => {
    const pool = poolFor(
        new ScriptedFullRunPool({
          statusRows: {
            ingest_staging_records: [
              { count: "2", status: "promoted" },
              { count: "1", status: "ignored" },
            ],
            parse_jobs: [{ count: "3", status: "succeeded" }],
            parser_results: [
              { count: "4", status: "current" },
              { count: "1", status: "archived_elsewhere" },
            ],
            replays: [{ count: "5", status: "parsed" }],
          },
        }),
      ),
      repository = new PgFullRunStatisticsRepository(pool);

    await expect(repository.getFullRunLifecycleCounts()).resolves.toEqual({
      parseJobs: {
        failed: 0,
        published: 0,
        queued: 0,
        retryable: 0,
        running: 0,
        succeeded: 3,
      },
      parserResults: {
        archived_elsewhere: 1,
        current: 4,
        failed: 0,
        superseded: 0,
      },
      replays: {
        archived: 0,
        parse_failed: 0,
        parsed: 5,
        ready_for_parse: 0,
        staged: 0,
      },
      staging: {
        conflicted: 0,
        failed: 0,
        ignored: 1,
        pending: 0,
        processing: 0,
        promoted: 2,
      },
    });
  });

  it("Maps current parser result targets with freshness and identity evidence", async () => {
    const repository = new PgFullRunStatisticsRepository(
      poolFor(
        new ScriptedFullRunPool({
          targetRows: [
            {
              bounty_points_fresh: true,
              commander_stats_fresh: true,
              parser_result_created_at: new Date("2026-05-12T00:00:00.000Z"),
              parser_result_id: "result-1",
              player_stats_fresh: true,
              raw_snapshot: {
                contract_version: "3.0.0",
                parser: {},
                players: [{ eid: 1, n: "Alpha" }],
                source: {},
                status: "success",
              },
              replay_id: "replay-1",
              replay_timestamp: new Date("2026-05-12T00:01:00.000Z"),
              rotation_id: "rotation-1",
              source_replay_id: "source-1",
              source_system: "solidgames",
              squad_stats_fresh: true,
            },
            {
              bounty_points_fresh: true,
              commander_stats_fresh: false,
              parser_result_created_at: new Date("2026-05-12T00:02:00.000Z"),
              parser_result_id: "result-2",
              player_stats_fresh: true,
              raw_snapshot: {
                contract_version: "3.0.0",
                parser: {},
                players: [
                  { eid: 2, n: "   " },
                  { eid: 3, n: "Bravo" },
                ],
                source: {},
                status: "success",
              },
              replay_id: "replay-2",
              replay_timestamp: null,
              rotation_id: null,
              source_replay_id: "source-2",
              source_system: "solidgames",
              squad_stats_fresh: true,
            },
            {
              bounty_points_fresh: true,
              commander_stats_fresh: true,
              parser_result_created_at: new Date("2026-05-12T00:03:00.000Z"),
              parser_result_id: "result-3",
              player_stats_fresh: true,
              raw_snapshot: {
                contract_version: "3.0.0",
                parser: {},
                source: {},
                status: "success",
              },
              replay_id: "replay-3",
              replay_timestamp: new Date("2026-05-12T00:04:00.000Z"),
              rotation_id: "rotation-1",
              source_replay_id: "source-3",
              source_system: "solidgames",
              squad_stats_fresh: true,
            },
          ],
        }),
      ),
    );

    await expect(repository.listCurrentParserResultTargets()).resolves.toEqual([
      {
        missingIdentityPlayerCount: 0,
        parserResultCreatedAt: "2026-05-12T00:00:00.000Z",
        parserResultId: "result-1",
        playerCount: 1,
        replayId: "replay-1",
        replayTimestamp: "2026-05-12T00:01:00.000Z",
        rotationId: "rotation-1",
        sourceReplayId: "source-1",
        sourceSystem: "solidgames",
        stale: false,
      },
      {
        missingIdentityPlayerCount: 1,
        parserResultCreatedAt: "2026-05-12T00:02:00.000Z",
        parserResultId: "result-2",
        playerCount: 2,
        replayId: "replay-2",
        replayTimestamp: null,
        rotationId: null,
        sourceReplayId: "source-2",
        sourceSystem: "solidgames",
        stale: true,
      },
      {
        missingIdentityPlayerCount: 0,
        parserResultCreatedAt: "2026-05-12T00:03:00.000Z",
        parserResultId: "result-3",
        playerCount: 0,
        replayId: "replay-3",
        replayTimestamp: "2026-05-12T00:04:00.000Z",
        rotationId: "rotation-1",
        sourceReplayId: "source-3",
        sourceSystem: "solidgames",
        stale: false,
      },
    ]);
  });

  it("Maps assigned rotations to a replay map and drops replays without a covering rotation", async () => {
    const pool = new ScriptedFullRunPool({
        assignedRows: [
          { replay_id: "replay-1", rotation_id: "rotation-1" },
          { replay_id: "replay-2", rotation_id: null },
          { replay_id: "replay-3", rotation_id: "rotation-2" },
        ],
      }),
      repository = new PgFullRunStatisticsRepository(poolFor(pool));

    const assigned = await repository.assignRotationsForCurrentReplays();

    expect([...assigned.entries()]).toEqual([
      ["replay-1", "rotation-1"],
      ["replay-3", "rotation-2"],
    ]);
    expect(pool.queries[0]?.startsWith("update replays")).toBe(true);
  });
});

interface StatusRow {
  count: string;
  status: string;
}

interface FullRunTargetRow {
  bounty_points_fresh: boolean;
  commander_stats_fresh: boolean;
  parser_result_created_at: Date;
  parser_result_id: string;
  player_stats_fresh: boolean;
  raw_snapshot: unknown;
  replay_id: string;
  replay_timestamp: Date | null;
  rotation_id: string | null;
  source_replay_id: string;
  source_system: string;
  squad_stats_fresh: boolean;
}

class ScriptedFullRunPool {
  public readonly queries: string[] = [];

  public constructor(
    private readonly options: {
      assignedRows?: { replay_id: string; rotation_id: string | null }[];
      statusRows?: Record<string, StatusRow[]>;
      targetRows?: FullRunTargetRow[];
    },
  ) {}

  public query(sql: string): Promise<{ rows: unknown[] }> {
    const normalizedSql = sql.trim();
    this.queries.push(normalizedSql);
    if (normalizedSql.startsWith("update replays")) {
      return Promise.resolve({ rows: this.options.assignedRows ?? [] });
    }
    if (normalizedSql.includes("from parser_results pr")) {
      return Promise.resolve({ rows: this.options.targetRows ?? [] });
    }
    return Promise.resolve({
      rows: this.options.statusRows?.[statusTable(normalizedSql)] ?? [],
    });
  }
}

function statusTable(sql: string): string {
  for (const table of [
    "ingest_staging_records",
    "replays",
    "parse_jobs",
    "parser_results",
  ]) {
    if (sql.includes(`from ${table}`)) {
      return table;
    }
  }
  throw new Error(`Unrecognized status count query: ${sql}`);
}

function poolFor(pool: ScriptedFullRunPool): Pool {
  return pool as unknown as Pool;
}
