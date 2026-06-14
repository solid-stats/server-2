/* eslint-disable camelcase, max-lines-per-function, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "../repository.js";

import { bountyInsertRows } from "./insert-assertions.js";
import {
  ScriptedClient,
  bountyInsertParameters,
  poolFor,
} from "./utilities.js";

const FULL_FACTOR_POINTS = 9;

// The audit path classifies the triggering replay as 'sg' (ScriptedClient default
// game_type), so it rebuilds the sg per-rotation bucket (with prior-rotation
// carry-in) AND the sg all-time bucket (rotation_id NULL, no carry-in) → 2 inserts
// (BLOCKER 1). The bounty-input mechanics under test (factors, exclusions, victim
// resolution) are asserted on the FIRST insert = the per-rotation sg row, which
// carries the previous-rotation factors. The two-scope shape is proven end-to-end
// in the real-pg harness.
describe("PgStatisticsRepository bounty calculation inputs", () => {
  it("persists bounty points with previous rotation factors and exclusion evidence", async () => {
    const client = new ScriptedClient({
        withBountyMemberships: true,
        withVictimIdentity: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 2,
      rotationId: "rotation-1",
      status: "recalculated",
    });

    // FINDING 5: each scope issues exactly ONE multi-row insert (not one per
    // row). Two scopes (sg per-rotation + sg all-time) → two insert statements.
    expect(bountyInsertParameters(client)).toHaveLength(2);

    // The per-rotation sg insert (with carry-in) is written first.
    expect(bountyInsertRows(client)[0]).toEqual([
      "rotation-1",
      "player-1",
      FULL_FACTOR_POINTS,
      {
        base_score: 1,
        events: [
          {
            event_type: "kill",
            player_factor: 2,
            points: FULL_FACTOR_POINTS,
            replay_id: "replay-1",
            squad_factor: 2,
            victim_player_id: "player-2",
            victim_squad_id: "squad-2",
          },
          {
            event_type: "teamkill",
            excluded_reason: "teamkill",
            points: 0,
            replay_id: "replay-1",
            victim_player_id: "player-2",
            victim_squad_id: "squad-2",
          },
        ],
        total_points: FULL_FACTOR_POINTS,
        version: 1,
      },
      "sg",
    ]);
    // The second insert is the sg all-time bucket (rotation_id NULL).
    expect(bountyInsertRows(client)[1]?.[0]).toBeNull();
    expect(bountyInsertRows(client)[1]?.[4]).toBe("sg");
  });

  it("Ignores compact player counter events when building bounty candidates", async () => {
    const client = new ScriptedClient({
        withBountyMemberships: true,
        withCounterEvent: true,
        withVictimIdentity: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 2,
      rotationId: "rotation-1",
      status: "recalculated",
    });

    // First insert = the per-rotation sg row carrying the resolved events.
    expect(bountyInsertRows(client)[0]?.[3]).toMatchObject({
      events: [
        {
          event_type: "kill",
          points: FULL_FACTOR_POINTS,
        },
        {
          event_type: "teamkill",
          excluded_reason: "teamkill",
          points: 0,
        },
      ],
      total_points: FULL_FACTOR_POINTS,
    });
  });

  it("skips parser events that cannot be resolved to an attacker", async () => {
    const client = new ScriptedClient({ unknownAttackerRef: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 0,
      rotationId: "rotation-1",
      status: "recalculated",
    });

    expect(bountyInsertParameters(client)).toEqual([]);
  });

  it("records missing victim when enemy kill payload has no victim entity", async () => {
    const client = new ScriptedClient({ missingVictimPayload: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toMatchObject({
      bountyRows: 2,
      status: "recalculated",
    });

    expect(bountyInsertRows(client)[0]?.[3]).toMatchObject({
      events: [
        {
          excluded_reason: "missing_victim",
          points: 0,
        },
        {
          excluded_reason: "teamkill",
          points: 0,
        },
      ],
    });
  });

  it("uses zero previous factors when previous rotation is missing", async () => {
    const client = new ScriptedClient({
        missingPreviousRotation: true,
        withVictimIdentity: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toMatchObject({
      bountyRows: 2,
      status: "recalculated",
    });

    expect(bountyInsertRows(client)[0]?.[2]).toBe(1);
  });

  it("uses zero previous factors when previous stats are invalid", async () => {
    const client = new ScriptedClient({
        invalidPreviousStats: true,
        withBountyMemberships: true,
        withVictimIdentity: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toMatchObject({
      bountyRows: 2,
      status: "recalculated",
    });

    expect(bountyInsertRows(client)[0]?.[2]).toBe(1);
  });
});

describe("PgStatisticsRepository bounty recalculation lifecycle", () => {
  it("commits missing timestamp result without bounty writes", async () => {
    const client = new ScriptedClient({ missingReplayTimestamp: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 0,
      rotationId: null,
      status: "missing_replay_timestamp",
    });
  });

  it("commits missing rotation result without bounty writes", async () => {
    const client = new ScriptedClient({ missingRotation: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 0,
      rotationId: null,
      status: "missing_rotation",
    });
  });

  it("commits empty bounty recalculation when rotation has no current parser results", async () => {
    const client = new ScriptedClient({ emptyParserResults: true }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).resolves.toEqual({
      bountyRows: 0,
      rotationId: "rotation-1",
      status: "recalculated",
    });
  });

  it("rolls back and releases the client when bounty replacement fails", async () => {
    const client = new ScriptedClient({
        failOn: "delete from bounty_points",
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await expect(
      repository.recalculateBountyPointsForParserResult("result-1"),
    ).rejects.toThrow("scripted failure");

    expect(client.queries).toContain("rollback");
    expect(client.released).toBe(true);
  });
});
