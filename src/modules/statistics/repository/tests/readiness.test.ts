/* eslint-disable camelcase, id-length, max-lines-per-function, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgStatisticsReadinessRepository } from "../readiness.js";

import type { Pool } from "pg";

describe("PgStatisticsReadinessRepository", () => {
  it("Maps rotation, replay, parser identity, and nickname evidence rows", async () => {
    const repository = new PgStatisticsReadinessRepository(
      poolFor(
        new ScriptedReadinessPool({
          identityRows: [
            {
              display_name: "Alpha",
              nickname: "A",
              observed_from: new Date("2026-01-01T00:00:00.000Z"),
              observed_to: null,
              player_id: "player-1",
            },
            {
              display_name: "Bravo",
              nickname: null,
              observed_from: null,
              observed_to: null,
              player_id: "player-2",
            },
          ],
          parserRows: [
            {
              parser_result_id: "result-1",
              raw_snapshot: {
                contract_version: "3.0.0",
                parser: {},
                players: [
                  { eid: 101, n: "Alpha" },
                  { eid: 202, n: "Bravo", sid: "steam-202" },
                ],
                source: {},
                status: "success",
              },
              replay_id: "replay-1",
              replay_timestamp: new Date("2026-02-01T00:00:00.000Z"),
              source_replay_id: "source-1",
              source_system: "solidgames",
            },
            {
              parser_result_id: "result-2",
              raw_snapshot: {
                contract_version: "3.0.0",
                parser: {},
                source: {},
                status: "success",
              },
              replay_id: "replay-2",
              replay_timestamp: null,
              source_replay_id: "source-2",
              source_system: "solidgames",
            },
          ],
          replayRows: [
            {
              matched_rotation_ids: ["rotation-1"],
              replay_id: "replay-1",
              replay_timestamp: new Date("2026-02-01T00:00:00.000Z"),
              rotation_match_count: "1",
              source_replay_id: "source-1",
              source_system: "solidgames",
            },
            {
              matched_rotation_ids: [],
              replay_id: "replay-2",
              replay_timestamp: null,
              rotation_match_count: "0",
              source_replay_id: "source-2",
              source_system: "solidgames",
            },
          ],
          rotationRows: [
            {
              ends_at: null,
              id: "rotation-1",
              name: "Rotation 1",
              replay_count: "1",
              starts_at: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
        }),
      ),
    );

    await expect(repository.getRotationRanges()).resolves.toEqual([
      {
        endsAt: null,
        id: "rotation-1",
        name: "Rotation 1",
        replayCount: 1,
        startsAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await expect(repository.getReplayRotationEvidence()).resolves.toEqual([
      {
        matchedRotationIds: ["rotation-1"],
        replayId: "replay-1",
        replayTimestamp: "2026-02-01T00:00:00.000Z",
        rotationMatchCount: 1,
        sourceReplayId: "source-1",
        sourceSystem: "solidgames",
      },
      {
        matchedRotationIds: [],
        replayId: "replay-2",
        replayTimestamp: null,
        rotationMatchCount: 0,
        sourceReplayId: "source-2",
        sourceSystem: "solidgames",
      },
    ]);
    await expect(
      repository.getCurrentParserIdentityEvidence(),
    ).resolves.toEqual([
      {
        parserResultId: "result-1",
        players: [
          { entityRef: "101", observedName: "Alpha" },
          { entityRef: "202", observedName: "Bravo", steamId: "steam-202" },
        ],
        replayId: "replay-1",
        replayTimestamp: "2026-02-01T00:00:00.000Z",
        sourceReplayId: "source-1",
        sourceSystem: "solidgames",
      },
      {
        parserResultId: "result-2",
        players: [],
        replayId: "replay-2",
        replayTimestamp: null,
        sourceReplayId: "source-2",
        sourceSystem: "solidgames",
      },
    ]);
    await expect(repository.getIdentityReferences()).resolves.toEqual([
      {
        displayName: "Alpha",
        nickname: "A",
        observedFrom: "2026-01-01T00:00:00.000Z",
        observedTo: null,
        playerId: "player-1",
      },
      {
        displayName: "Bravo",
        observedFrom: null,
        observedTo: null,
        playerId: "player-2",
      },
    ]);
  });
});

interface ScriptedReadinessOptions {
  identityRows: unknown[];
  parserRows: unknown[];
  replayRows: unknown[];
  rotationRows: unknown[];
}

class ScriptedReadinessPool {
  public constructor(private readonly options: ScriptedReadinessOptions) {}

  public query(sql: string): Promise<{ rows: unknown[] }> {
    const normalizedSql = sql.trim();
    if (normalizedSql.startsWith("select rotations.id")) {
      return Promise.resolve({ rows: this.options.rotationRows });
    }
    if (normalizedSql.startsWith("select replays.id as replay_id")) {
      return Promise.resolve({ rows: this.options.replayRows });
    }
    if (normalizedSql.startsWith("select parser_results.id")) {
      return Promise.resolve({ rows: this.options.parserRows });
    }
    return Promise.resolve({ rows: this.options.identityRows });
  }
}

function poolFor(pool: ScriptedReadinessPool): Pool {
  return pool as unknown as Pool;
}
