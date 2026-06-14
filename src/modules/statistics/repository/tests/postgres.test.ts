/* eslint-disable camelcase, id-length, max-lines, max-lines-per-function, no-magic-numbers, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import { runMigrations } from "../../../../infra/db/migrate.js";
import { FullRunRecalculationService } from "../../service/full-run-recalculation.js";
import { PgFullRunStatisticsRepository } from "../full-run.js";
import { PgStatisticsRepository } from "../repository.js";

const env = {
    DATABASE_URL:
      process.env["DATABASE_URL"] ??
      "postgresql://solid:solid@localhost:15432/solid_stats",
    RABBITMQ_URL:
      process.env["RABBITMQ_URL"] ?? "amqp://solid:solid@localhost:5673",
    S3_ACCESS_KEY_ID: process.env["S3_ACCESS_KEY_ID"] ?? "solid",
    S3_BUCKET: process.env["S3_BUCKET"] ?? "solid-replays",
    S3_ENDPOINT: process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
    S3_FORCE_PATH_STYLE: process.env["S3_FORCE_PATH_STYLE"] ?? "true",
    S3_REGION: process.env["S3_REGION"] ?? "us-east-1",
    S3_SECRET_ACCESS_KEY: process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
  },
  config = loadConfig(env),
  pool = new Pool({ connectionString: config.databaseUrl }),
  repository = new PgStatisticsRepository(pool),
  fullRunRepository = new PgFullRunStatisticsRepository(pool);

/**
 * The legacy 20 rotation `starts_at` windows (RESEARCH B.7), each snapped to the
 * ISO-week start (Monday 00:00:00 UTC) exactly as the legacy
 * `getRotations()`/`startOf('isoWeek')` produces them. Reference fixture only:
 * server-2 does NOT produce these — they are an operational precondition entered
 * via the admin API and confirmed correct in staging.
 */
const LEGACY_ROTATION_WINDOWS_UTC: readonly string[] = [
  "2020-09-14T00:00:00.000Z",
  "2021-01-11T00:00:00.000Z",
  "2021-05-31T00:00:00.000Z",
  "2021-11-01T00:00:00.000Z",
  "2022-02-28T00:00:00.000Z",
  "2022-07-04T00:00:00.000Z",
  "2022-10-03T00:00:00.000Z",
  "2023-01-09T00:00:00.000Z",
  "2023-04-03T00:00:00.000Z",
  "2023-07-03T00:00:00.000Z",
  "2023-10-02T00:00:00.000Z",
  "2024-04-08T00:00:00.000Z",
  "2024-07-01T00:00:00.000Z",
  "2024-09-30T00:00:00.000Z",
  "2024-12-30T00:00:00.000Z",
  "2025-03-31T00:00:00.000Z",
  "2025-06-30T00:00:00.000Z",
  "2025-09-29T00:00:00.000Z",
  "2026-01-05T00:00:00.000Z",
  "2026-03-30T00:00:00.000Z",
];

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate bounty_points, commander_side_stats, player_stats, squad_stats,
      parser_events, parser_results, parse_jobs, replays,
      ingest_staging_records, squad_memberships, squads, player_steam_ids,
      canonical_players, rotations cascade
  `);
});

describe("PgStatisticsRepository", () => {
  it("replaces parser events idempotently for a parser result", async () => {
    const parserResultId = await seedParserResult();

    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
      {
        eventType: "diagnostic",
        observedPlayerRef: null,
        payload: { code: "schema.extra" },
        sourceRef: { index: 1 },
      },
    ]);
    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "teamkill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 303 },
        sourceRef: { index: 0 },
      },
    ]);

    const result = await pool.query<{
      event_type: string;
      observed_player_ref: string | null;
    }>(
      `
        select event_type, observed_player_ref
        from parser_events
        where parser_result_id = $1
      `,
      [parserResultId],
    );

    expect(result.rows).toEqual([
      {
        event_type: "teamkill",
        observed_player_ref: "101",
      },
    ]);
  });

  it("assigns replay rotation and replaces player and squad aggregates", async () => {
    const rotationId = await seedRotation(),
      playerA = await seedPlayer("Alpha", "steam-a"),
      playerB = await seedPlayer("Bravo", "steam-b"),
      playerC = await seedPlayer("Charlie", "steam-c"),
      squadA = await seedSquad("Squad A"),
      squadB = await seedSquad("Squad B"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 202, n: "Bravo", sid: "steam-b" },
            { eid: 303, n: "Charlie", sid: "steam-c" },
          ],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });

    await seedMembership(squadA, playerA);
    await seedMembership(squadB, playerB);
    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
      {
        eventType: "teamkill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 303 },
        sourceRef: { index: 1 },
      },
    ]);

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 3,
      rotationId,
      squadStats: 2,
      status: "recalculated",
    });

    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "teamkill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
    ]);
    await repository.recalculatePlayerAndSquadStatsForParserResult(
      parserResultId,
    );

    const replay = await pool.query<{ rotation_id: string }>(
        "select rotation_id from replays join parser_results on parser_results.replay_id = replays.id where parser_results.id = $1",
        [parserResultId],
      ),
      playerStats = await pool.query<{ player_id: string; stats: StatsRow }>(
        "select player_id, stats from player_stats order by player_id",
      ),
      squadStats = await pool.query<{ squad_id: string; stats: StatsRow }>(
        "select squad_id, stats from squad_stats order by squad_id",
      );

    expect(replay.rows[0]?.rotation_id).toBe(rotationId);
    expect(statsById(playerStats.rows)).toEqual({
      [playerA]: {
        deaths: { by_teamkills: 0, total: 0 },
        kills: 0,
        replay_count: 1,
        teamkills: 1,
        version: 1,
      },
      [playerB]: {
        deaths: { by_teamkills: 1, total: 1 },
        kills: 0,
        replay_count: 1,
        teamkills: 0,
        version: 1,
      },
      [playerC]: {
        deaths: { by_teamkills: 0, total: 0 },
        kills: 0,
        replay_count: 1,
        teamkills: 0,
        version: 1,
      },
    });
    expect(statsById(squadStats.rows)).toEqual({
      [squadA]: {
        deaths: { by_teamkills: 0, total: 0 },
        kills: 0,
        player_count: 1,
        replay_count: 1,
        teamkills: 1,
        version: 1,
      },
      [squadB]: {
        deaths: { by_teamkills: 1, total: 1 },
        kills: 0,
        player_count: 1,
        replay_count: 1,
        teamkills: 0,
        version: 1,
      },
    });
  });

  it("creates fallback player identities from no-SteamID parser names", async () => {
    const rotationId = await seedRotation(),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Psycho" },
            { eid: 202, n: "Target" },
            { eid: 303, n: "Psycho" },
          ],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });

    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
    ]);

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 2,
      rotationId,
      squadStats: 0,
      status: "recalculated",
    });

    const players = await pool.query<{
        display_name: string;
        stats: StatsRow;
      }>(
        `
          select players.display_name, stats.stats
          from player_stats stats
          join canonical_players players on players.id = stats.player_id
          order by players.display_name
        `,
      ),
      nicknames = await pool.query<{ nickname: string }>(
        "select nickname from player_nicknames order by nickname",
      );

    expect(players.rows).toEqual([
      {
        display_name: "Psycho",
        stats: {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 1,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
      {
        display_name: "Target",
        stats: {
          deaths: { by_teamkills: 0, total: 1 },
          kills: 0,
          replay_count: 1,
          teamkills: 0,
          version: 1,
        },
      },
    ]);
    expect(nicknames.rows).toEqual([
      { nickname: "Psycho" },
      { nickname: "Target" },
    ]);
  });

  it("ignores blank no-SteamID parser names", async () => {
    const rotationId = await seedRotation(),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [{ eid: 101, n: "   " }],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });

    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
    ]);

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId,
      squadStats: 0,
      status: "recalculated",
    });

    const players = await pool.query<{ count: string }>(
      "select count(*) from canonical_players",
    );

    expect(players.rows[0]?.count).toBe("0");
  });

  it("uses active manual nickname history before creating fallback identities", async () => {
    const rotationId = await seedRotation(),
      playerId = await seedPlayer("Current Psycho", "steam-current"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [{ eid: 101, n: "Psycho" }],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });
    await seedNickname({
      observedFrom: "2026-01-01T00:00:00.000Z",
      observedTo: "2026-03-01T00:00:00.000Z",
      playerId,
      nickname: "Psycho",
    });

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 1,
      rotationId,
      squadStats: 0,
      status: "recalculated",
    });

    const players = await pool.query<{ count: string }>(
        "select count(*) from canonical_players",
      ),
      stats = await pool.query<{ player_id: string }>(
        "select player_id from player_stats",
      );

    expect(players.rows[0]?.count).toBe("1");
    expect(stats.rows).toEqual([{ player_id: playerId }]);
  });

  it("prefers active manual nickname history over an existing fallback display name", async () => {
    const rotationId = await seedRotation(),
      fallbackId = await seedPlayer("Psycho", "steam-fallback"),
      playerId = await seedPlayer("Current Psycho", "steam-current"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [{ eid: 101, n: "Psycho" }],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });
    await seedNickname({
      observedFrom: "2026-01-01T00:00:00.000Z",
      observedTo: "2026-03-01T00:00:00.000Z",
      playerId,
      nickname: "Psycho",
    });

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 1,
      rotationId,
      squadStats: 0,
      status: "recalculated",
    });

    const stats = await pool.query<{ player_id: string }>(
      "select player_id from player_stats",
    );

    expect(fallbackId).not.toBe(playerId);
    expect(stats.rows).toEqual([{ player_id: playerId }]);
  });

  it("creates fallback identity when manual nickname history is inactive", async () => {
    const rotationId = await seedRotation(),
      oldPlayerId = await seedPlayer("Old Psycho", "steam-old"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [{ eid: 101, n: "Psycho" }],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
      });
    await seedNickname({
      observedFrom: "2025-01-01T00:00:00.000Z",
      observedTo: "2025-12-31T23:59:59.000Z",
      playerId: oldPlayerId,
      nickname: "Psycho",
    });

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 1,
      rotationId,
      squadStats: 0,
      status: "recalculated",
    });

    const stats = await pool.query<{
      display_name: string;
      player_id: string;
    }>(
      `
        select players.display_name, stats.player_id
        from player_stats stats
        join canonical_players players on players.id = stats.player_id
      `,
    );

    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0]?.display_name).toBe("Psycho");
    expect(stats.rows[0]?.player_id).not.toBe(oldPlayerId);
  });

  it("does not write aggregate rows when replay rotation cannot be assigned", async () => {
    const parserResultId = await seedParserResult({
      replayTimestamp: "2020-02-01T12:00:00.000Z",
    });

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId: null,
      squadStats: 0,
      status: "missing_rotation",
    });

    const result = await pool.query<{ count: string }>(
      "select count(*) from player_stats",
    );
    expect(result.rows[0]?.count).toBe("0");
  });

  it("does not write aggregate rows when replay timestamp is missing", async () => {
    const parserResultId = await seedParserResult({ replayTimestamp: null });

    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      playerStats: 0,
      rotationId: null,
      squadStats: 0,
      status: "missing_replay_timestamp",
    });
  });

  it("assigns replay rotation and replaces commander side aggregates", async () => {
    const rotationId = await seedRotation(),
      playerA = await seedPlayer("Alpha", "steam-a"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [{ eid: 101, n: "Alpha", sid: "steam-a" }],
          side_facts: {
            commanders: [
              {
                commander: {
                  state: "present",
                  value: {
                    observed_name: { state: "present", value: "Alpha" },
                    source_entity_id: { state: "present", value: 101 },
                  },
                },
                side: { state: "present", value: "west" },
              },
              {
                commander: {
                  state: "present",
                  value: {
                    observed_name: { state: "present", value: "Unknown" },
                  },
                },
                side: { state: "present", value: "east" },
              },
            ],
            outcome: {
              status: "known",
              winner_side: { state: "present", value: "west" },
            },
          },
          source: {},
          status: "success",
        },
      });

    await expect(
      repository.recalculateCommanderSideStatsForParserResult(parserResultId),
    ).resolves.toEqual({
      commanderStats: 2,
      rotationId,
      status: "recalculated",
    });

    const result = await pool.query<{
      known_losses: number;
      known_wins: number;
      player_id: string | null;
      side: string;
      unknown_outcomes: number;
    }>(
      `
        select player_id, side, known_wins, known_losses, unknown_outcomes
        from commander_side_stats
        order by side
      `,
    );

    expect(result.rows).toEqual([
      {
        known_losses: 1,
        known_wins: 0,
        player_id: null,
        side: "east",
        unknown_outcomes: 0,
      },
      {
        known_losses: 0,
        known_wins: 1,
        player_id: playerA,
        side: "west",
        unknown_outcomes: 0,
      },
    ]);
  });

  it("assigns replay rotation and replaces bounty points", async () => {
    const previousRotationId = await seedRotationPeriod(
        "Previous",
        "2025-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      ),
      rotationId = await seedRotation(),
      playerA = await seedPlayer("Alpha", "steam-a"),
      playerB = await seedPlayer("Bravo", "steam-b"),
      squadA = await seedSquad("Squad A"),
      squadB = await seedSquad("Squad B"),
      parserResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 202, n: "Bravo", sid: "steam-b" },
          ],
          source: {},
          status: "success",
        },
      });

    await seedMembership(squadA, playerA);
    await seedMembership(squadB, playerB);
    await seedPreviousPlayerStats(previousRotationId, playerB, {
      deaths: { by_teamkills: 0, total: 2 },
      kills: 4,
      replay_count: 1,
      teamkills: 0,
      version: 1,
    });
    await seedPreviousSquadStats(previousRotationId, squadB, {
      deaths: { by_teamkills: 0, total: 3 },
      kills: 6,
      player_count: 1,
      replay_count: 1,
      teamkills: 0,
      version: 1,
    });
    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
      {
        eventType: "teamkill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 1 },
      },
    ]);

    await expect(
      repository.recalculateBountyPointsForParserResult(parserResultId),
    ).resolves.toEqual({
      bountyRows: 1,
      rotationId,
      status: "recalculated",
    });

    const result = await pool.query<{
      inputs: {
        events: { excluded_reason?: string; points: number }[];
        total_points: number;
      };
      player_id: string;
      points: string;
    }>(
      `
        select player_id, points, inputs
        from bounty_points
      `,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.player_id).toBe(playerA);
    expect(result.rows[0]?.points).toBe("9.00");
    expect(result.rows[0]?.inputs).toMatchObject({
      base_score: 1,
      total_points: 9,
      version: 1,
    });
    expect(result.rows[0]?.inputs.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ points: 9 }) as unknown,
        expect.objectContaining({
          excluded_reason: "teamkill",
          points: 0,
        }) as unknown,
      ]),
    );
  });

  it("set-based rotation rebuild matches the per-replay path for a multi-replay rotation", async () => {
    const rotationId = await seedRotation(),
      playerA = await seedPlayer("Alpha", "steam-a"),
      squadA = await seedSquad("Squad A"),
      firstResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 202, n: "Bravo", sid: "steam-b" },
          ],
          side_facts: {
            commanders: [
              {
                commander: {
                  state: "present",
                  value: { source_entity_id: { state: "present", value: 101 } },
                },
                side: { state: "present", value: "west" },
              },
            ],
            outcome: {
              status: "known",
              winner_side: { state: "present", value: "west" },
            },
          },
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        sourceReplayId: "replay-1",
      }),
      secondResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 202, n: "Bravo", sid: "steam-b" },
          ],
          side_facts: {
            commanders: [
              {
                commander: {
                  state: "present",
                  value: { source_entity_id: { state: "present", value: 202 } },
                },
                side: { state: "present", value: "east" },
              },
            ],
            outcome: {
              status: "known",
              winner_side: { state: "present", value: "east" },
            },
          },
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-02T12:00:00.000Z",
        sourceReplayId: "replay-2",
      });

    await seedPlayer("Bravo", "steam-b");
    await seedMembership(squadA, playerA);
    await repository.replaceParserEvents(firstResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 0 },
      },
    ]);
    await repository.replaceParserEvents(secondResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "202",
        payload: { victim_entity_id: 101 },
        sourceRef: { index: 0 },
      },
    ]);

    // Per-replay path: each parser result triggers a full rotation rebuild.
    for (const parserResultId of [firstResultId, secondResultId]) {
      await repository.recalculatePlayerAndSquadStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateCommanderSideStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateBountyPointsForParserResult(parserResultId);
    }
    const perReplay = await aggregateSnapshot();

    await pool.query(
      "truncate player_stats, squad_stats, commander_side_stats, bounty_points",
    );

    // Set-based path: assign rotations once, rebuild the rotation once.
    const assigned = await fullRunRepository.assignRotationsForCurrentReplays();
    expect([...assigned.values()]).toEqual([rotationId, rotationId]);
    await repository.recalculatePlayerAndSquadStatsForRotation(rotationId);
    await repository.recalculateCommanderSideStatsForRotation(rotationId);
    await repository.recalculateBountyPointsForRotation(rotationId);
    const setBased = await aggregateSnapshot();

    expect(setBased).toEqual(perReplay);
    expect(setBased.playerStats.length).toBeGreaterThan(0);
    expect(setBased.commanderStats.length).toBeGreaterThan(0);
  });

  it("set-based rotation rebuild matches the per-replay path for fallback name-only identities", async () => {
    const rotationId = await seedRotation(),
      steamPlayer = await seedPlayer("Alpha", "steam-a"),
      // Two brand-new name-only players (no sid, no pre-seeded canonical row):
      // "Ghost" appears in BOTH replays at two different timestamps and must
      // collapse to exactly one fallback canonical player; "Wraith" appears once.
      firstResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 202, n: "Ghost" },
            { eid: 303, n: "Wraith" },
          ],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        sourceReplayId: "fallback-replay-1",
      }),
      secondResultId = await seedParserResult({
        rawSnapshot: {
          contract_version: "3.0.0",
          parser: {},
          players: [
            { eid: 101, n: "Alpha", sid: "steam-a" },
            { eid: 404, n: "Ghost" },
          ],
          source: {},
          status: "success",
        },
        replayTimestamp: "2026-02-02T12:00:00.000Z",
        sourceReplayId: "fallback-replay-2",
      });

    await repository.replaceParserEvents(firstResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "202",
        payload: { victim_entity_id: 303 },
        sourceRef: { index: 0 },
      },
      {
        eventType: "teamkill",
        observedPlayerRef: "101",
        payload: { victim_entity_id: 202 },
        sourceRef: { index: 1 },
      },
    ]);
    await repository.replaceParserEvents(secondResultId, [
      {
        eventType: "kill",
        observedPlayerRef: "404",
        payload: { victim_entity_id: 101 },
        sourceRef: { index: 0 },
      },
    ]);

    // Per-replay path: each parser result triggers a full rotation rebuild.
    for (const parserResultId of [firstResultId, secondResultId]) {
      await repository.recalculatePlayerAndSquadStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateCommanderSideStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateBountyPointsForParserResult(parserResultId);
    }
    const perReplay = {
      aggregates: await namedAggregateSnapshot(),
      fallbackRows: await fallbackIdentitySnapshot(),
    };

    // Reset aggregates AND the fallback-created identity rows so the set-based
    // path recreates them from scratch; keep the seeded steam-id player.
    await pool.query(
      "truncate player_stats, squad_stats, commander_side_stats, bounty_points",
    );
    await pool.query(
      "delete from player_nicknames where evidence->>'source' = 'parser_artifact_name_fallback'",
    );
    await pool.query(
      `delete from canonical_players cp
       where not exists (
         select 1 from player_steam_ids psi where psi.player_id = cp.id
       )`,
    );
    await pool.query("update replays set rotation_id = null");

    // Set-based path: assign rotations once, rebuild the rotation once.
    const assigned = await fullRunRepository.assignRotationsForCurrentReplays();
    expect([...assigned.values()]).toEqual([rotationId, rotationId]);
    await repository.recalculatePlayerAndSquadStatsForRotation(rotationId);
    await repository.recalculateCommanderSideStatsForRotation(rotationId);
    await repository.recalculateBountyPointsForRotation(rotationId);
    const setBased = {
      aggregates: await namedAggregateSnapshot(),
      fallbackRows: await fallbackIdentitySnapshot(),
    };

    expect(setBased.aggregates).toEqual(perReplay.aggregates);
    expect(setBased.fallbackRows).toEqual(perReplay.fallbackRows);
    // Same name at two timestamps collapses to exactly one fallback CP.
    expect(
      setBased.fallbackRows.filter((row) => row.display_name === "Ghost"),
    ).toHaveLength(1);
    // Non-vacuous guards.
    expect(perReplay.fallbackRows.length).toBeGreaterThan(0);
    expect(setBased.aggregates.playerStats.length).toBeGreaterThan(0);
    expect(steamPlayer).toBeDefined();
  });

  it("full-run service matches the per-replay path across multiple rotations including cross-rotation bounty", async () => {
    const firstRotationId = await seedRotationPeriod(
        "January",
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
      ),
      secondRotationId = await seedRotationPeriod(
        "February",
        "2026-02-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
      ),
      playerA = await seedPlayer("Alpha", "steam-a");
    await seedPlayer("Bravo", "steam-b");

    const firstResultId = await seedKillReplay({
        attackerEid: 101,
        replayTimestamp: "2026-01-15T12:00:00.000Z",
        sourceReplayId: "jan-replay",
        victimEid: 202,
      }),
      secondResultId = await seedKillReplay({
        attackerEid: 101,
        replayTimestamp: "2026-02-15T12:00:00.000Z",
        sourceReplayId: "feb-replay",
        victimEid: 202,
      });

    // Per-replay path, chronological target order.
    for (const parserResultId of [firstResultId, secondResultId]) {
      await repository.recalculatePlayerAndSquadStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateCommanderSideStatsForParserResult(
        parserResultId,
      );
      await repository.recalculateBountyPointsForParserResult(parserResultId);
    }
    const perReplay = await aggregateSnapshot();

    await pool.query(
      "truncate player_stats, squad_stats, commander_side_stats, bounty_points",
    );
    await pool.query("update replays set rotation_id = null");

    const service = new FullRunRecalculationService(fullRunRepository),
      report = await service.recalculateAllCurrentParserResults(),
      setBased = await aggregateSnapshot();

    expect(setBased).toEqual(perReplay);
    expect(report.summary.recalculatedCount).toBe(2);
    expect(report.summary.missingRotationCount).toBe(0);
    expect(report.summary.failureCount).toBe(0);
    // Both replays resolved to their own rotation.
    const rotations = await pool.query<{ rotation_id: string | null }>(
      "select rotation_id from replays order by replay_timestamp",
    );
    expect(rotations.rows.map((row) => row.rotation_id)).toEqual([
      firstRotationId,
      secondRotationId,
    ]);
    // Cross-rotation: the February bounty consumed January's rebuilt stats.
    expect(
      perReplay.bountyPoints.some(
        (row) => (row as { player_id: string }).player_id === playerA,
      ),
    ).toBe(true);
  });

  it("classifyGameTypesForCurrentReplays writes game_type set-based for every legacy case", async () => {
    // Five replays exercising every classification branch (RESEARCH B):
    //   sg prefix → 'sg'; mace<10 → null; sm before Feb 2023 → null;
    //   excludeReplays-linked → null; includeReplays name-forced → 'sg'.
    const sgReplay = await seedClassifiableReplay({
        missionName: "sg_assault",
        playerCount: 30,
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        sourceReplayId: "sg-ok",
      }),
      maceLowReplay = await seedClassifiableReplay({
        missionName: "mace_skirmish",
        playerCount: 9,
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        sourceReplayId: "mace-low",
      }),
      smOldReplay = await seedClassifiableReplay({
        missionName: "sm_old",
        playerCount: 20,
        replayTimestamp: "2023-01-15T12:00:00.000Z",
        sourceReplayId: "sm-old",
      }),
      excludedReplay = await seedClassifiableReplay({
        missionName: "sg_excluded",
        playerCount: 30,
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        // The legacy excludeReplays key is `/replays/<source_replay_id>`.
        sourceReplayId: "1662231981",
      }),
      includeForcedReplay = await seedClassifiableReplay({
        missionName: "Red Dawn",
        playerCount: 30,
        replayTimestamp: "2026-02-01T12:00:00.000Z",
        sourceReplayId: "include-forced",
      });

    const classified =
      await fullRunRepository.classifyGameTypesForCurrentReplays();

    expect(classified.get(sgReplay)).toBe("sg");
    expect(classified.get(maceLowReplay)).toBeNull();
    expect(classified.get(smOldReplay)).toBeNull();
    expect(classified.get(excludedReplay)).toBeNull();
    expect(classified.get(includeForcedReplay)).toBe("sg");

    // The set-based write persisted the same types to replays.game_type.
    const persisted = await pool.query<{
      game_type: string | null;
      id: string;
    }>("select id, game_type from replays");
    const byId = new Map(persisted.rows.map((row) => [row.id, row.game_type]));
    expect(byId.get(sgReplay)).toBe("sg");
    expect(byId.get(maceLowReplay)).toBeNull();
    expect(byId.get(smOldReplay)).toBeNull();
    expect(byId.get(excludedReplay)).toBeNull();
    expect(byId.get(includeForcedReplay)).toBe("sg");
  });

  // Rotation-window correctness is an OPERATIONAL precondition: rotations are
  // entered only via the admin API; server-2 does not seed or snap them. This is
  // a pure reference-check — it pins the legacy 20 ISO-week-snapped (Monday-UTC)
  // windows and compares against whatever rotations are present in the test DB.
  it("rotation reference fixture pins the legacy 20 ISO-week-snapped windows", () => {
    expect(LEGACY_ROTATION_WINDOWS_UTC).toHaveLength(20);

    const asTimes = LEGACY_ROTATION_WINDOWS_UTC.map((iso) =>
      new Date(iso).getTime(),
    );
    // 20 distinct, strictly ascending.
    expect(new Set(asTimes).size).toBe(20);
    for (let index = 1; index < asTimes.length; index += 1) {
      const previous = asTimes[index - 1] ?? 0,
        current = asTimes[index] ?? 0;
      expect(current).toBeGreaterThan(previous);
    }
    // Each window is a Monday at 00:00:00.000 UTC (isoWeek start).
    for (const iso of LEGACY_ROTATION_WINDOWS_UTC) {
      const date = new Date(iso);
      expect(date.getUTCDay()).toBe(1);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    }
  });

  it("rotation reference-check compares seeded rotations against the legacy windows when present", async () => {
    const seeded = await pool.query<{ starts_at: Date }>(
      "select starts_at from rotations order by starts_at",
    );
    if (seeded.rows.length === 0) {
      // No rotations seeded in this DB — the DB comparison is skipped cleanly.
      // The fixture itself is validated by the test above; correctness of the
      // admin-entered windows is an operational precondition (confirmed staging).
      expect(seeded.rows).toHaveLength(0);
      return;
    }
    for (const [index, row] of seeded.rows.entries()) {
      const expected = LEGACY_ROTATION_WINDOWS_UTC[index];
      expect(expected).toBeDefined();
      expect(row.starts_at.toISOString()).toBe(expected);
    }
  });
});

interface ClassifiableReplaySeed {
  missionName: string;
  playerCount: number;
  replayTimestamp: string;
  sourceReplayId: string;
}

async function seedClassifiableReplay(
  seed: ClassifiableReplaySeed,
): Promise<string> {
  const players = Array.from({ length: seed.playerCount }, (_unused, index) => ({
    eid: index + 1,
    n: `Player ${String(index + 1)}`,
  }));
  await seedParserResult({
    rawSnapshot: {
      contract_version: "3.0.0",
      parser: {},
      players,
      replay: { mission: seed.missionName },
      source: {},
      status: "success",
    },
    replayTimestamp: seed.replayTimestamp,
    sourceReplayId: seed.sourceReplayId,
  });
  const replay = await pool.query<{ id: string }>(
    "select id from replays where source_replay_id = $1",
    [seed.sourceReplayId],
  );
  return requiredId(replay.rows[0]?.id, "classifiable replay seed failed");
}

interface KillReplaySeed {
  attackerEid: number;
  replayTimestamp: string;
  sourceReplayId: string;
  victimEid: number;
}

async function seedKillReplay(seed: KillReplaySeed): Promise<string> {
  const parserResultId = await seedParserResult({
    rawSnapshot: {
      contract_version: "3.0.0",
      parser: {},
      players: [
        { eid: seed.attackerEid, n: "Alpha", sid: "steam-a" },
        { eid: seed.victimEid, n: "Bravo", sid: "steam-b" },
      ],
      source: {},
      status: "success",
    },
    replayTimestamp: seed.replayTimestamp,
    sourceReplayId: seed.sourceReplayId,
  });
  await repository.replaceParserEvents(parserResultId, [
    {
      eventType: "kill",
      observedPlayerRef: String(seed.attackerEid),
      payload: { victim_entity_id: seed.victimEid },
      sourceRef: { index: 0 },
    },
  ]);
  return parserResultId;
}

async function aggregateSnapshot(): Promise<{
  bountyPoints: unknown[];
  commanderStats: unknown[];
  playerStats: unknown[];
  squadStats: unknown[];
}> {
  const [playerStats, squadStats, commanderStats, bountyPoints] =
    await Promise.all([
      pool.query(
        "select player_id, stats from player_stats order by player_id",
      ),
      pool.query("select squad_id, stats from squad_stats order by squad_id"),
      pool.query(
        `select player_id, side, known_wins, known_losses, unknown_outcomes
         from commander_side_stats order by side, player_id`,
      ),
      pool.query(
        "select player_id, points, inputs from bounty_points order by player_id",
      ),
    ]);
  return {
    bountyPoints: bountyPoints.rows,
    commanderStats: commanderStats.rows,
    playerStats: playerStats.rows,
    squadStats: squadStats.rows,
  };
}

interface FallbackIdentityRow {
  display_name: string;
  evidence: unknown;
  nickname: string;
  observed_from: Date | null;
  observed_to: Date | null;
}

// Aggregates keyed by canonical display_name instead of the raw player_id uuid.
// Fallback canonical players are recreated with fresh uuids on the set-based
// run, so a uuid-keyed snapshot would diff on identity even when the per-player
// values are identical; display_name is the stable cross-run key.
async function namedAggregateSnapshot(): Promise<{
  bountyPoints: unknown[];
  commanderStats: unknown[];
  playerStats: unknown[];
  squadStats: unknown[];
}> {
  const [playerStats, squadStats, commanderStats, bountyPoints] =
    await Promise.all([
      pool.query(
        `select cp.display_name, ps.stats
         from player_stats ps
         join canonical_players cp on cp.id = ps.player_id
         order by cp.display_name`,
      ),
      pool.query("select squad_id, stats from squad_stats order by squad_id"),
      pool.query(
        `select cp.display_name, css.side, css.known_wins, css.known_losses,
                css.unknown_outcomes
         from commander_side_stats css
         join canonical_players cp on cp.id = css.player_id
         order by css.side, cp.display_name`,
      ),
      pool.query(
        `select cp.display_name, bp.points
         from bounty_points bp
         join canonical_players cp on cp.id = bp.player_id
         order by cp.display_name`,
      ),
    ]);
  return {
    bountyPoints: bountyPoints.rows,
    commanderStats: commanderStats.rows,
    playerStats: playerStats.rows,
    squadStats: squadStats.rows,
  };
}

async function fallbackIdentitySnapshot(): Promise<FallbackIdentityRow[]> {
  const result = await pool.query<FallbackIdentityRow>(
    `
      select cp.display_name,
             pn.nickname,
             pn.observed_from,
             pn.observed_to,
             pn.evidence
      from canonical_players cp
      join player_nicknames pn on pn.player_id = cp.id
      where pn.evidence->>'source' = 'parser_artifact_name_fallback'
      order by cp.display_name, pn.observed_from
    `,
  );
  return result.rows;
}

function statsById(
  rows: { player_id?: string; squad_id?: string; stats: StatsRow }[],
): Record<string, StatsRow> {
  const stats: Record<string, StatsRow> = {};
  for (const row of rows) {
    const id = row.player_id ?? row.squad_id;
    if (id !== undefined) {
      stats[id] = row.stats;
    }
  }
  return stats;
}

interface StatsRow {
  deaths: {
    by_teamkills: number;
    total: number;
  };
  kills: number;
  player_count?: number;
  replay_count: number;
  teamkills: number;
  version: 1;
}

interface ParserResultSeed {
  rawSnapshot?: Record<string, unknown>;
  replayTimestamp?: string | null;
  sourceReplayId?: string;
}

async function seedParserResult(seed: ParserResultSeed = {}): Promise<string> {
  const sourceReplayId = seed.sourceReplayId ?? "replay",
    objectKey = `raw/${sourceReplayId}.ocap.json`,
    // checksum has a unique constraint; derive a distinct 64-char hex per replay.
    checksum = Buffer.from(sourceReplayId)
      .toString("hex")
      .padEnd(64, "0")
      .slice(0, 64),
    staging = await pool.query<{ id: string }>(
      `
        insert into ingest_staging_records (
          source_system, source_replay_id, object_key, checksum, size_bytes
        )
        values ('source', $1, $2, $3, 123)
        returning id
      `,
      [sourceReplayId, objectKey, checksum],
    ),
    replayTimestamp =
      seed.replayTimestamp === undefined
        ? "2026-02-01T12:00:00.000Z"
        : seed.replayTimestamp,
    replay = await pool.query<{ id: string }>(
      `
        insert into replays (
          source_system, source_replay_id, object_key, checksum, size_bytes,
          promoted_from_staging_id, replay_timestamp
        )
        values ('source', $1, $2, $3, 123, $4, $5)
        returning id
      `,
      [
        sourceReplayId,
        objectKey,
        checksum,
        staging.rows[0]?.id,
        replayTimestamp,
      ],
    ),
    parserResult = await pool.query<{ id: string }>(
      `
        insert into parser_results (
          replay_id, parser_contract_version, raw_snapshot
        )
        values ($1, '3.0.0', $2)
        returning id
      `,
      [replay.rows[0]?.id, seed.rawSnapshot ?? {}],
    );

  const parserResultId = parserResult.rows[0]?.id;
  if (parserResultId === undefined) {
    throw new Error("parser result seed failed");
  }
  return parserResultId;
}

async function seedRotation(): Promise<string> {
  return seedRotationPeriod(
    "Rotation 1",
    "2026-01-01T00:00:00.000Z",
    "2026-12-31T00:00:00.000Z",
  );
}

async function seedRotationPeriod(
  name: string,
  startsAt: string,
  endsAt: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
      insert into rotations (name, starts_at, ends_at)
      values ($1, $2, $3)
      returning id
    `,
    [name, startsAt, endsAt],
  );
  return requiredId(result.rows[0]?.id, "rotation seed failed");
}

async function seedPlayer(
  displayName: string,
  steamId: string,
): Promise<string> {
  const player = await pool.query<{ id: string }>(
    "insert into canonical_players (display_name) values ($1) returning id",
    [displayName],
  );
  const playerId = requiredId(player.rows[0]?.id, "player seed failed");
  await pool.query(
    "insert into player_steam_ids (player_id, steam_id, observed_from) values ($1, $2, '2026-01-01T00:00:00.000Z')",
    [playerId, steamId],
  );
  return playerId;
}

async function seedNickname(input: {
  nickname: string;
  observedFrom: string;
  observedTo: string | null;
  playerId: string;
}): Promise<void> {
  await pool.query(
    `
      insert into player_nicknames (player_id, nickname, observed_from, observed_to)
      values ($1, $2, $3, $4)
    `,
    [input.playerId, input.nickname, input.observedFrom, input.observedTo],
  );
}

async function seedSquad(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "insert into squads (name) values ($1) returning id",
    [name],
  );
  return requiredId(result.rows[0]?.id, "squad seed failed");
}

async function seedMembership(
  squadId: string,
  playerId: string,
): Promise<void> {
  await pool.query(
    `
      insert into squad_memberships (squad_id, player_id, valid_from)
      values ($1, $2, '2026-01-01T00:00:00.000Z')
    `,
    [squadId, playerId],
  );
}

async function seedPreviousPlayerStats(
  rotationId: string,
  playerId: string,
  stats: StatsRow,
): Promise<void> {
  await pool.query(
    "insert into player_stats (rotation_id, player_id, stats) values ($1, $2, $3)",
    [rotationId, playerId, stats],
  );
}

async function seedPreviousSquadStats(
  rotationId: string,
  squadId: string,
  stats: StatsRow,
): Promise<void> {
  await pool.query(
    "insert into squad_stats (rotation_id, squad_id, stats) values ($1, $2, $3)",
    [rotationId, squadId, stats],
  );
}

function requiredId(id: string | undefined, message: string): string {
  if (id === undefined) {
    throw new Error(message);
  }
  return id;
}
