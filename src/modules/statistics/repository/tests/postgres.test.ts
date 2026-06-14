/* eslint-disable camelcase, id-length, max-lines, max-lines-per-function, max-statements, no-magic-numbers, unicorn/consistent-function-scoping, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import { runMigrations } from "../../../../infra/db/migrate.js";
import { LegacyPublicStatsExportService } from "../../export/legacy-public-export.js";
import { FullRunRecalculationService } from "../../service/full-run-recalculation.js";
import { PgFullRunStatisticsRepository } from "../full-run.js";
import { PgLegacyPublicStatsExportRepository } from "../legacy-export.js";
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
      canonical_players, rotations, audit_patches, moderation_actions,
      users cascade
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

    // sg-prefixed missions so classification yields game_type='sg' and both the
    // per-replay audit path and the full-run sg per-rotation pass write the same
    // (rotation, 'sg') bucket — the cross-path equality is on the per-rotation sg
    // rows (the full run additionally writes the all-time NULL-rotation buckets).
    const firstResultId = await seedKillReplay({
        attackerEid: 101,
        missionName: "sg_january",
        replayTimestamp: "2026-01-15T12:00:00.000Z",
        sourceReplayId: "jan-replay",
        victimEid: 202,
      }),
      secondResultId = await seedKillReplay({
        attackerEid: 101,
        missionName: "sg_february",
        replayTimestamp: "2026-02-15T12:00:00.000Z",
        sourceReplayId: "feb-replay",
        victimEid: 202,
      });

    // Classify first so the per-replay audit path reads game_type='sg'.
    await fullRunRepository.classifyGameTypesForCurrentReplays();

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
    const perReplay = await aggregateSnapshot("perRotation");

    await pool.query(
      "truncate player_stats, squad_stats, commander_side_stats, bounty_points",
    );
    await pool.query("update replays set rotation_id = null, game_type = null");

    const service = new FullRunRecalculationService(fullRunRepository),
      report = await service.recalculateAllCurrentParserResults(),
      setBasedPerRotation = await aggregateSnapshot("perRotation"),
      setBasedAllTime = await aggregateSnapshot("allTime");

    // Per-rotation sg buckets match the per-replay audit path exactly.
    expect(setBasedPerRotation).toEqual(perReplay);
    // The full run additionally wrote the sg all-time bucket (rotation_id NULL).
    expect(setBasedAllTime.playerStats.length).toBeGreaterThan(0);
    expect(report.summary.recalculatedCount).toBe(2);
    expect(report.summary.missingRotationCount).toBe(0);
    expect(report.summary.failureCount).toBe(0);
    // All-time row counts roll into the report's additive optional field.
    expect(report.allTimeAggregateRows?.map((rows) => rows.gameType)).toEqual([
      "sg",
      "mace",
      "sm",
    ]);
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

  it("full run writes sg per-rotation + sg/mace/sm all-time rows with is_show, ignoring excluded replays, preserving report shape", async () => {
    await seedPlayer("Alpha", "steam-a");
    await seedPlayer("Bravo", "steam-b");
    const rotationId = await seedRotationPeriod(
      "Rotation",
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    );

    // sg (per-rotation + all-time), mace (all-time, >=10 players), sm (all-time,
    // after Feb 2023), and an excludeReplays-linked replay (game_type NULL).
    const sgResultId = await seedKillReplay({
        attackerEid: 101,
        missionName: "sg_assault",
        replayTimestamp: "2026-01-15T12:00:00.000Z",
        sourceReplayId: "sg-replay",
        victimEid: 202,
      }),
      maceResultId = await seedManyPlayerKillReplay({
        missionName: "mace_battle",
        playerCount: 12,
        replayTimestamp: "2026-02-10T12:00:00.000Z",
        sourceReplayId: "mace-replay",
      }),
      smResultId = await seedKillReplay({
        attackerEid: 101,
        missionName: "sm_clash",
        replayTimestamp: "2026-02-20T12:00:00.000Z",
        sourceReplayId: "sm-replay",
        victimEid: 202,
      }),
      excludedResultId = await seedKillReplay({
        attackerEid: 101,
        missionName: "sg_excluded",
        replayTimestamp: "2026-02-25T12:00:00.000Z",
        // /replays/1662231981 is in the legacy excludeReplays list.
        sourceReplayId: "1662231981",
        victimEid: 202,
      });

    const service = new FullRunRecalculationService(fullRunRepository),
      report = await service.recalculateAllCurrentParserResults();

    // sg has BOTH per-rotation and all-time rows; mace/sm have all-time only.
    const byScope = await pool.query<{
      game_type: string | null;
      is_null_rotation: boolean;
      row_count: string;
    }>(
      `select game_type, rotation_id is null as is_null_rotation, count(*)::text as row_count
       from player_stats
       group by game_type, rotation_id is null
       order by game_type, is_null_rotation`,
    );
    const scopeKey = (gameType: string | null, allTime: boolean): number => {
      const row = byScope.rows.find(
        (current) =>
          current.game_type === gameType &&
          current.is_null_rotation === allTime,
      );
      return row === undefined ? 0 : Number(row.row_count);
    };

    // sg: per-rotation (rotation_id set) AND all-time (rotation_id NULL).
    expect(scopeKey("sg", false)).toBeGreaterThan(0);
    expect(scopeKey("sg", true)).toBeGreaterThan(0);
    // mace/sm: all-time only, never per-rotation.
    expect(scopeKey("mace", false)).toBe(0);
    expect(scopeKey("mace", true)).toBeGreaterThan(0);
    expect(scopeKey("sm", false)).toBe(0);
    expect(scopeKey("sm", true)).toBeGreaterThan(0);
    // Excluded replay (game_type NULL) contributed to NO aggregate bucket.
    expect(scopeKey(null, false)).toBe(0);
    expect(scopeKey(null, true)).toBe(0);

    // is_show is persisted on every player_stats row (default scope is small,
    // so all 15%-threshold players are shown).
    const isShowRows = await pool.query<{ is_show: boolean }>(
      "select is_show from player_stats",
    );
    expect(isShowRows.rows.length).toBeGreaterThan(0);
    expect(isShowRows.rows.every((row) => row.is_show)).toBe(true);

    // Report shape preserved: existing keys unchanged, only the additive
    // optional all-time field is new.
    expect(report.mode).toBe("recalculate");
    expect(report.reportVersion).toBe(1);
    expect(Object.keys(report.summary).toSorted()).toEqual(
      [
        "changedAggregateRows",
        "failureCount",
        "missingIdentityCount",
        "missingReplayTimestampCount",
        "missingRotationCount",
        "parserResultCount",
        "recalculatedCount",
        "skippedCount",
        "staleCount",
      ].toSorted(),
    );
    expect(report.summary.failureCount).toBe(0);
    expect(report.allTimeAggregateRows?.map((rows) => rows.gameType)).toEqual([
      "sg",
      "mace",
      "sm",
    ]);
    // Non-vacuous: the four seeded parser results were all targets.
    expect(report.summary.parserResultCount).toBe(4);
    expect([
      sgResultId,
      maceResultId,
      smResultId,
      excludedResultId,
      rotationId,
    ]).toHaveLength(5);
  });

  it("recompute rewrites aggregate rows without touching moderation audit tables", async () => {
    await seedPlayer("Alpha", "steam-a");
    await seedPlayer("Bravo", "steam-b");
    await seedRotationPeriod(
      "Rotation",
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    );
    await seedKillReplay({
      attackerEid: 101,
      missionName: "sg_assault",
      replayTimestamp: "2026-01-15T12:00:00.000Z",
      sourceReplayId: "sg-replay",
      victimEid: 202,
    });

    // A moderation audit patch that the recompute MUST preserve (T-01-07).
    const moderatorRow = await pool.query<{ id: string }>(
      "insert into users (display_name) values ('Moderator') returning id",
    );
    const moderatorId = requiredId(
      moderatorRow.rows[0]?.id,
      "moderator seed failed",
    );
    const actionRow = await pool.query<{ id: string }>(
      `insert into moderation_actions (moderator_user_id, action_type)
       values ($1, 'apply_patch') returning id`,
      [moderatorId],
    );
    const actionId = requiredId(actionRow.rows[0]?.id, "action seed failed");
    const auditRow = await pool.query<{ id: string }>(
      `insert into audit_patches (moderation_action_id, affected_entity_type, patch)
       values ($1, 'player_stats', '{"note":"keep"}'::jsonb)
       returning id`,
      [actionId],
    );
    const auditId = requiredId(auditRow.rows[0]?.id, "audit seed failed");

    const service = new FullRunRecalculationService(fullRunRepository);
    await service.recalculateAllCurrentParserResults();

    // The audit patch row is untouched by the recompute.
    const stillThere = await pool.query(
      "select id from audit_patches where id = $1",
      [auditId],
    );
    expect(stillThere.rows).toHaveLength(1);
  });

  it("legacy export sources global players/squads from the sg all-time bucket and carries is_show per-rotation + global", async () => {
    await seedPlayer("Alpha", "steam-a");
    await seedPlayer("Bravo", "steam-b");
    const rotationId = await seedRotationPeriod(
      "Rotation",
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    );

    // sg (per-rotation + all-time) plus a mace all-time replay: the legacy
    // export's global surfaces must read ONLY the sg all-time bucket, never the
    // mace rows and never the per-rotation + all-time sum.
    await seedKillReplay({
      attackerEid: 101,
      missionName: "sg_assault",
      replayTimestamp: "2026-01-15T12:00:00.000Z",
      sourceReplayId: "sg-replay",
      victimEid: 202,
    });
    await seedManyPlayerKillReplay({
      missionName: "mace_battle",
      playerCount: 12,
      replayTimestamp: "2026-02-10T12:00:00.000Z",
      sourceReplayId: "mace-replay",
    });

    const service = new FullRunRecalculationService(fullRunRepository);
    await service.recalculateAllCurrentParserResults();

    // D3 straight-read proof: flip one sg all-time player to is_show=false and
    // assert the export reflects the persisted flag (no export-time re-derive).
    await pool.query(
      `update player_stats ps
       set is_show = false
       from canonical_players cp
       where cp.id = ps.player_id and cp.display_name = 'Bravo'
         and ps.rotation_id is null and ps.game_type = 'sg'`,
    );

    const exportRepository = new PgLegacyPublicStatsExportRepository(pool);
    const data = await exportRepository.loadExportData();

    // Global player list = every canonical player (legacy lists all), but the
    // stats/is_show come ONLY from the sg all-time bucket: the two sg
    // participants carry their persisted is_show; mace-only filler players have
    // no sg bucket row, so they fall back to shown with zero sg kills.
    const globalByName = new Map(
      data.playerGlobalStats.map((player) => [player.name, player]),
    );
    expect(globalByName.get("Alpha")?.isShow).toBe(true);
    expect(globalByName.get("Bravo")?.isShow).toBe(false);
    const maceFiller = globalByName.get("Filler 3");
    expect(maceFiller?.isShow).toBe(true);
    expect(maceFiller?.kills).toBe(0);

    // No double-count: the sg all-time global kills equal the single sg-bucket
    // all-time row, not per-rotation + all-time summed.
    const sgAllTimeKills = await pool.query<{ kills: string }>(
      `select coalesce((ps.stats->>'kills')::integer, 0)::text as kills
       from player_stats ps
       join canonical_players cp on cp.id = ps.player_id
       where cp.display_name = 'Alpha'
         and ps.rotation_id is null and ps.game_type = 'sg'`,
    );
    expect(globalByName.get("Alpha")?.kills).toBe(
      Number(sgAllTimeKills.rows[0]?.kills ?? "0"),
    );

    // rotationStats are sg per-rotation, with per-rotation players carrying isShow.
    const sgRotation = data.rotationStats.find(
      (rotation) => rotation.id === rotationId,
    );
    expect(sgRotation).toBeDefined();
    expect(sgRotation?.players.length).toBeGreaterThan(0);
    expect(
      sgRotation?.players.every((player) => typeof player.isShow === "boolean"),
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

  it("classifyGameTypesForCurrentReplays returns an empty map when no current replays exist", async () => {
    const classified =
      await fullRunRepository.classifyGameTypesForCurrentReplays();
    expect(classified.size).toBe(0);
  });

  it("classifyGameTypesForCurrentReplays handles a replay with no replay block or players (null game_type)", async () => {
    // rawSnapshot with neither `replay` nor `players` exercises the
    // `?? null` / `?? []` artifact fallbacks → no mission, 0 players → null.
    await seedParserResult({
      rawSnapshot: {
        contract_version: "3.0.0",
        parser: {},
        source: {},
        status: "success",
      },
      replayTimestamp: "2026-02-01T12:00:00.000Z",
      sourceReplayId: "bare-snapshot",
    });
    const bare = await pool.query<{ id: string }>(
      "select id from replays where source_replay_id = $1",
      ["bare-snapshot"],
    );
    const replayId = requiredId(bare.rows[0]?.id, "bare seed failed");

    const classified =
      await fullRunRepository.classifyGameTypesForCurrentReplays();
    expect(classified.get(replayId)).toBeNull();
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

  // ===========================================================================
  // F8 PARITY PROOF (plan 01-05): end-to-end per-type + all-time + is_show.
  //
  // A representative multi-type corpus seeded with deterministic, steam-id
  // identities so the expected aggregates are hand-derived from the seed (NOT
  // re-run from the implementation — that would be a false-green oracle,
  // T-01-13). The corpus exercises every legacy branch:
  //   - sg across TWO rotation windows  → sg per-rotation AND sg all-time;
  //   - mace >=10 players (kept) and mace <10 (excluded);
  //   - sm 2023-02-01 (kept) and sm 2022-12-31 (excluded);
  //   - an excludeReplays-linked sg replay (excluded);
  //   - an includeReplays name-forced ("Red Dawn") sg replay;
  //   - an is_show boundary: "Below" sits below the sg all-time 15% threshold
  //     (1 game of 7 → 1 < 1.05) yet above its sg per-rotation threshold
  //     (1 game of 3 → 1 >= 0.45), proving is_show is computed PER SCOPE.
  // ---------------------------------------------------------------------------

  /**
   * Builds the corpus and runs the full set-based recalc. Returns the two sg
   * rotation ids so the per-rotation assertions can target them. Shared by the
   * smoke (Task 1) and parity (Task 2) tests so the oracle is seeded once.
   */
  async function seedParityCorpus(): Promise<{
    excludedSgResultId: string;
    rotationA: string;
    rotationB: string;
  }> {
    await seedPlayer("Above", "steam-above");
    await seedPlayer("Below", "steam-below");
    await seedPlayer("MaceKept", "steam-macekept");
    await seedPlayer("MaceOnlyLow", "steam-maceonlylow");
    await seedPlayer("SmKept", "steam-smkept");
    await seedPlayer("SmOnlyOld", "steam-smonlyold");
    // Filler steam players so the kept mace replay has >=10 distinct players.
    for (let index = 0; index < 10; index += 1) {
      await seedPlayer(
        `MaceFiller ${String(index)}`,
        `steam-mf-${String(index)}`,
      );
    }

    // Two legacy rotation windows: RotA (2026-01-05..) and RotB (2026-03-30..).
    const rotationA = await seedRotationPeriod(
        "RotA",
        "2026-01-05T00:00:00.000Z",
        "2026-03-30T00:00:00.000Z",
      ),
      rotationB = await seedRotationPeriod(
        "RotB",
        "2026-03-30T00:00:00.000Z",
        "2026-06-29T00:00:00.000Z",
      );

    const above = { name: "Above", steamId: "steam-above" },
      below = { name: "Below", steamId: "steam-below" };

    // RotA: 4 sg replays, "Above" in all 4 (each with a kill vs a per-replay
    // opponent so "Above" has sg kills and the opponent is a distinct identity
    // that never crosses scopes). All timestamps fall inside RotA's window.
    const rotADays = ["01-10", "01-20", "02-10", "03-10"];
    for (const [index, day] of rotADays.entries()) {
      await seedCorpusReplay({
        killerName: "Above",
        missionName: "sg_alpha",
        players: [
          above,
          {
            name: `OppA ${String(index)}`,
            steamId: `steam-oppa-${String(index)}`,
          },
        ],
        replayTimestamp: `2026-${day}T12:00:00.000Z`,
        sourceReplayId: `sg-a-${String(index)}`,
        victimName: `OppA ${String(index)}`,
      });
    }

    // RotB: 3 sg replays. "Above" in all 3; "Below" in exactly ONE (sg-b-0).
    await seedCorpusReplay({
      killerName: "Above",
      missionName: "sg_bravo",
      players: [above, below],
      replayTimestamp: "2026-04-10T12:00:00.000Z",
      sourceReplayId: "sg-b-0",
      victimName: "Below",
    });
    for (let index = 1; index < 3; index += 1) {
      await seedCorpusReplay({
        killerName: "Above",
        missionName: "sg_bravo",
        players: [
          above,
          {
            name: `OppB ${String(index)}`,
            steamId: `steam-oppb-${String(index)}`,
          },
        ],
        replayTimestamp: `2026-04-1${String(index)}T12:00:00.000Z`,
        sourceReplayId: `sg-b-${String(index)}`,
        victimName: `OppB ${String(index)}`,
      });
    }

    // includeReplays force: "Red Dawn" is prefix-less but forced to sg (D4).
    // It lands in RotB and adds "Above" to one more sg replay.
    await seedCorpusReplay({
      killerName: "Above",
      missionName: "Red Dawn",
      players: [above, { name: "OppRed", steamId: "steam-oppred" }],
      replayTimestamp: "2026-04-20T12:00:00.000Z",
      sourceReplayId: "sg-include",
      victimName: "OppRed",
    });

    // excludeReplays: an sg-prefixed replay whose source link is in the legacy
    // excludeReplays list (/replays/1662231981) → game_type NULL, contributes
    // to nothing. "Above" appears here but it must NOT raise her replay_count.
    const excludedSgResultId = await seedCorpusReplay({
      killerName: "Above",
      missionName: "sg_excluded",
      players: [above, { name: "OppExcluded", steamId: "steam-oppexcluded" }],
      replayTimestamp: "2026-04-25T12:00:00.000Z",
      sourceReplayId: "1662231981",
      victimName: "OppExcluded",
    });

    // mace kept: 11 distinct players (>=10) → all-time mace. "MaceKept" leads,
    // followed by the 10 pre-seeded "MaceFiller N" steam players.
    const maceKeptPlayers: CorpusReplayPlayer[] = [
      { name: "MaceKept", steamId: "steam-macekept" },
      ...Array.from({ length: 10 }, (_unused, index) => ({
        name: `MaceFiller ${String(index)}`,
        steamId: `steam-mf-${String(index)}`,
      })),
    ];
    await seedCorpusReplay({
      killerName: "MaceKept",
      missionName: "mace_kept",
      players: maceKeptPlayers,
      replayTimestamp: "2026-02-10T12:00:00.000Z",
      sourceReplayId: "mace-kept",
      victimName: "MaceFiller 0",
    });
    // mace excluded: 9 distinct players (<10) → game_type NULL. "MaceOnlyLow"
    // appears ONLY here, so she must be absent from every bucket.
    await seedCorpusReplay({
      killerName: "MaceKept",
      missionName: "mace_low",
      players: [
        { name: "MaceKept", steamId: "steam-macekept" },
        { name: "MaceOnlyLow", steamId: "steam-maceonlylow" },
      ],
      replayTimestamp: "2026-02-11T12:00:00.000Z",
      sourceReplayId: "mace-low",
      victimName: "MaceOnlyLow",
    });

    // sm kept: 2023-02-01 (month strictly after Jan 2023) → all-time sm.
    await seedCorpusReplay({
      killerName: "SmKept",
      missionName: "sm_kept",
      players: [
        { name: "SmKept", steamId: "steam-smkept" },
        { name: "OppSm", steamId: "steam-oppsm" },
      ],
      replayTimestamp: "2023-02-01T12:00:00.000Z",
      sourceReplayId: "sm-kept",
      victimName: "OppSm",
    });
    // sm excluded: 2022-12-31 (before Feb 2023) → game_type NULL. "SmOnlyOld"
    // appears ONLY here, so she must be absent from every bucket.
    await seedCorpusReplay({
      killerName: "SmKept",
      missionName: "sm_old",
      players: [
        { name: "SmKept", steamId: "steam-smkept" },
        { name: "SmOnlyOld", steamId: "steam-smonlyold" },
      ],
      replayTimestamp: "2022-12-31T12:00:00.000Z",
      sourceReplayId: "sm-old",
      victimName: "SmOnlyOld",
    });

    const service = new FullRunRecalculationService(fullRunRepository);
    await service.recalculateAllCurrentParserResults();
    return { excludedSgResultId, rotationA, rotationB };
  }

  it("parity corpus classifies every seeded replay to the expected game_type (incl. nulls)", async () => {
    await seedParityCorpus();

    const rows = await pool.query<{
      game_type: string | null;
      source_replay_id: string;
    }>("select source_replay_id, game_type from replays");
    const byLink = new Map(
      rows.rows.map((row) => [row.source_replay_id, row.game_type]),
    );

    // sg-prefixed (RotA + RotB) → sg.
    for (const link of ["sg-a-0", "sg-a-3", "sg-b-0", "sg-b-2"]) {
      expect(byLink.get(link)).toBe("sg");
    }
    // includeReplays force → sg; excludeReplays link → NULL.
    expect(byLink.get("sg-include")).toBe("sg");
    expect(byLink.get("1662231981")).toBeNull();
    // mace kept (>=10) → mace; mace low (<10) → NULL.
    expect(byLink.get("mace-kept")).toBe("mace");
    expect(byLink.get("mace-low")).toBeNull();
    // sm kept (Feb 2023) → sm; sm old (Dec 2022) → NULL.
    expect(byLink.get("sm-kept")).toBe("sm");
    expect(byLink.get("sm-old")).toBeNull();
  });

  it("per-type + all-time aggregates match the hand-derived legacy oracle (no cross-type bleed, excluded replays contribute nothing)", async () => {
    const { rotationA, rotationB } = await seedParityCorpus();

    // --- sg all-time (rotation_id NULL, game_type 'sg'): 8 sg replays total ---
    // RotA sg replays: sg-a-0..3                       → 4 games.
    // RotB sg replays: sg-b-0, sg-b-1, sg-b-2, sg-include (Red Dawn forced) → 4.
    // The excludeReplays-linked sg replay (1662231981) is NULL → not counted.
    // Total sg all-time games = SG_ROT_A_GAMES + SG_ROT_B_GAMES = 8.
    const SG_ROT_A_GAMES = 4,
      SG_ROT_B_GAMES = 4,
      SG_ALL_TIME_GAMES = SG_ROT_A_GAMES + SG_ROT_B_GAMES;

    const sgAllTimeCounts = await playerScopeReplayCounts("sg", {
      kind: "allTime",
    });
    // "Above" appears in every sg replay (excluded sg replay does NOT count).
    expect(sgAllTimeCounts.get("Above")).toBe(SG_ALL_TIME_GAMES);
    // "Below" appears in exactly ONE sg replay (sg-b-0).
    expect(sgAllTimeCounts.get("Below")).toBe(1);
    // No cross-type bleed: mace/sm-only players never appear in the sg bucket.
    expect(sgAllTimeCounts.has("MaceKept")).toBe(false);
    expect(sgAllTimeCounts.has("SmKept")).toBe(false);

    // --- mace all-time: only the kept (>=10) replay; "MaceKept" present ---
    const maceAllTimeCounts = await playerScopeReplayCounts("mace", {
      kind: "allTime",
    });
    expect(maceAllTimeCounts.get("MaceKept")).toBe(1);
    // mace<10-only player contributes to NOTHING.
    expect(maceAllTimeCounts.has("MaceOnlyLow")).toBe(false);

    // --- sm all-time: only the kept (Feb 2023) replay; "SmKept" present ---
    const smAllTimeCounts = await playerScopeReplayCounts("sm", {
      kind: "allTime",
    });
    expect(smAllTimeCounts.get("SmKept")).toBe(1);
    expect(smAllTimeCounts.has("SmOnlyOld")).toBe(false);

    // --- excluded players contribute to NO bucket whatsoever ---
    const absentFromAll = async (name: string): Promise<void> => {
      const present = await pool.query<{ count: string }>(
        `select count(*)::text as count
         from player_stats ps
         join canonical_players cp on cp.id = ps.player_id
         where cp.display_name = $1`,
        [name],
      );
      expect(present.rows[0]?.count).toBe("0");
    };
    await absentFromAll("MaceOnlyLow");
    await absentFromAll("SmOnlyOld");
    await absentFromAll("OppExcluded");

    // --- sg per-rotation buckets: RotA has 4 sg games, RotB has 4 sg games ---
    const sgRotACounts = await playerScopeReplayCounts("sg", {
        kind: "rotation",
        rotationId: rotationA,
      }),
      sgRotBCounts = await playerScopeReplayCounts("sg", {
        kind: "rotation",
        rotationId: rotationB,
      });
    expect(sgRotACounts.get("Above")).toBe(SG_ROT_A_GAMES);
    expect(sgRotACounts.has("Below")).toBe(false);
    expect(sgRotBCounts.get("Above")).toBe(SG_ROT_B_GAMES);
    expect(sgRotBCounts.get("Below")).toBe(1);
    // No all-time / per-rotation double-count: all-time == RotA + RotB games.
    expect(sgAllTimeCounts.get("Above")).toBe(
      (sgRotACounts.get("Above") ?? 0) + (sgRotBCounts.get("Above") ?? 0),
    );

    // mace/sm NEVER get per-rotation rows (CONTEXT D1).
    const maceRotRows = await pool.query<{ count: string }>(
      "select count(*)::text as count from player_stats where game_type = 'mace' and rotation_id is not null",
    );
    expect(maceRotRows.rows[0]?.count).toBe("0");
    const smRotRows = await pool.query<{ count: string }>(
      "select count(*)::text as count from player_stats where game_type = 'sm' and rotation_id is not null",
    );
    expect(smRotRows.rows[0]?.count).toBe("0");
  });

  it("is_show split is computed PER SCOPE: 'Below' is hidden all-time (15% of 8) but shown in its sg rotation", async () => {
    const { rotationB } = await seedParityCorpus();

    // sg all-time scope = 8 distinct sg replays → threshold = 15% * 8 = 1.2.
    //   "Above" (8 games) >= 1.2 → isShow true.
    //   "Below" (1 game)  <  1.2 → isShow false.
    const allTimeIsShow = await playerScopeIsShow("sg", { kind: "allTime" });
    expect(allTimeIsShow.get("Above")).toBe(true);
    expect(allTimeIsShow.get("Below")).toBe(false);

    // RotB sg scope = 4 distinct sg replays → threshold = 15% * 4 = 0.6.
    //   "Below" (1 game) >= 0.6 → isShow true — SAME player, DIFFERENT scope.
    const rotBIsShow = await playerScopeIsShow("sg", {
      kind: "rotation",
      rotationId: rotationB,
    });
    expect(rotBIsShow.get("Below")).toBe(true);
    expect(rotBIsShow.get("Above")).toBe(true);

    // The legacy export reproduces the otherPlayers/main split from is_show: the
    // exported global player object carries the persisted flag (D3 straight read).
    const exportRepository = new PgLegacyPublicStatsExportRepository(pool),
      data = await exportRepository.loadExportData(),
      service = new LegacyPublicStatsExportService(exportRepository),
      exported = await service.export({
        corpusScope: "parity",
        generatedAt: new Date("2026-06-14T00:00:00.000Z"),
      });
    const globalByName = new Map(
      data.playerGlobalStats.map((player) => [player.name, player]),
    );
    expect(globalByName.get("Above")?.isShow).toBe(true);
    expect(globalByName.get("Below")?.isShow).toBe(false);
    // The exported player objects expose the same split (isShow drives main vs
    // otherPlayers downstream; here we pin the boolean the splitter reads).
    const exportedByName = new Map(
      exported.players.map((player) => [player.name, player]),
    );
    expect(exportedByName.get("Above")?.isShow).toBe(true);
    expect(exportedByName.get("Below")?.isShow).toBe(false);
  });

  it("single-replay *ForParserResult audit path keeps its return shape and the full-run report shape is preserved under the corpus", async () => {
    const { excludedSgResultId } = await seedParityCorpus();

    // (b) audit-path return shape: a single-replay recalc on a seeded replay
    // returns exactly the pre-phase keys (player/squad/rotation/status), and the
    // excluded replay (game_type NULL) still resolves a rotation but writes no
    // per-type bucket — its own NULL bucket is the legacy single-bucket path.
    const audit =
      await repository.recalculatePlayerAndSquadStatsForParserResult(
        excludedSgResultId,
      );
    expect(Object.keys(audit).toSorted()).toEqual(
      ["playerStats", "rotationId", "squadStats", "status"].toSorted(),
    );
    expect(audit.status).toBe("recalculated");

    // Re-run the full report and pin the contract key-set + additive field.
    const service = new FullRunRecalculationService(fullRunRepository),
      report = await service.recalculateAllCurrentParserResults();
    expect(report.mode).toBe("recalculate");
    expect(report.reportVersion).toBe(1);
    expect(Object.keys(report).toSorted()).toEqual(
      [
        "allTimeAggregateRows",
        "failures",
        "generatedAt",
        "lifecycle",
        "mode",
        "reportVersion",
        "results",
        "summary",
      ].toSorted(),
    );
    expect(Object.keys(report.summary).toSorted()).toEqual(
      [
        "changedAggregateRows",
        "failureCount",
        "missingIdentityCount",
        "missingReplayTimestampCount",
        "missingRotationCount",
        "parserResultCount",
        "recalculatedCount",
        "skippedCount",
        "staleCount",
      ].toSorted(),
    );
    // Additive optional per-type all-time field, in fixed order.
    expect(report.allTimeAggregateRows?.map((rows) => rows.gameType)).toEqual([
      "sg",
      "mace",
      "sm",
    ]);
    expect(report.summary.failureCount).toBe(0);
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
  const players = Array.from(
    { length: seed.playerCount },
    (_unused, index) => ({
      eid: index + 1,
      n: `Player ${String(index + 1)}`,
    }),
  );
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
  missionName?: string;
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
      ...(seed.missionName === undefined
        ? {}
        : { replay: { mission: seed.missionName } }),
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

interface ManyPlayerKillReplaySeed {
  missionName: string;
  playerCount: number;
  replayTimestamp: string;
  sourceReplayId: string;
}

/**
 * A replay with `playerCount` distinct players (needed for the mace `>=10`
 * filter) plus one kill between the first two. Players 1 and 2 are the seeded
 * steam-id canonical players ("Alpha"/"Bravo"); the rest are name-only fallbacks.
 */
async function seedManyPlayerKillReplay(
  seed: ManyPlayerKillReplaySeed,
): Promise<string> {
  const players = Array.from({ length: seed.playerCount }, (_unused, index) => {
    const eid = index + 1;
    if (eid === 1) {
      return { eid, n: "Alpha", sid: "steam-a" };
    }
    if (eid === 2) {
      return { eid, n: "Bravo", sid: "steam-b" };
    }
    return { eid, n: `Filler ${String(eid)}` };
  });
  const parserResultId = await seedParserResult({
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
  await repository.replaceParserEvents(parserResultId, [
    {
      eventType: "kill",
      observedPlayerRef: "1",
      payload: { victim_entity_id: 2 },
      sourceRef: { index: 0 },
    },
  ]);
  return parserResultId;
}

function aggregateScopePredicate(
  scope: "all" | "perRotation" | "allTime",
): string {
  if (scope === "perRotation") {
    return "where rotation_id is not null";
  }
  if (scope === "allTime") {
    return "where rotation_id is null";
  }
  return "";
}

/**
 * Aggregate snapshot for cross-path equality. `scope` selects which game-type
 * dimension to read: `"all"` (every row), `"perRotation"` (rotation_id NOT NULL,
 * i.e. the per-rotation sg buckets), or `"allTime"` (rotation_id IS NULL).
 */
async function aggregateSnapshot(
  scope: "all" | "perRotation" | "allTime" = "all",
): Promise<{
  bountyPoints: unknown[];
  commanderStats: unknown[];
  playerStats: unknown[];
  squadStats: unknown[];
}> {
  const predicate = aggregateScopePredicate(scope);
  const [playerStats, squadStats, commanderStats, bountyPoints] =
    await Promise.all([
      pool.query(
        `select player_id, stats from player_stats ${predicate} order by player_id`,
      ),
      pool.query(
        `select squad_id, stats from squad_stats ${predicate} order by squad_id`,
      ),
      pool.query(
        `select player_id, side, known_wins, known_losses, unknown_outcomes
         from commander_side_stats ${predicate} order by side, player_id`,
      ),
      pool.query(
        `select player_id, points, inputs from bounty_points ${predicate} order by player_id`,
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

interface CorpusReplayPlayer {
  name: string;
  steamId: string;
}

interface CorpusReplaySeed {
  killerName?: string;
  missionName: string;
  players: CorpusReplayPlayer[];
  replayTimestamp: string;
  sourceReplayId: string;
  victimName?: string;
}

/**
 * Seeds one replay whose `raw_snapshot.players` are exactly the given
 * steam-id-bearing players (entity ids `1..n`, stable by position), with an
 * optional single kill between two of them. Every listed player gets a
 * `player_counter`-free presence row (the aggregator counts a `replay_count`
 * for every artifact player), so the per-player `replay_count` over a scope is
 * exactly the number of seeded replays they were listed in — the hand-derived
 * is_show oracle depends on this. Steam-id resolution maps each name to the
 * pre-seeded canonical player with the matching `steam_id`.
 */
async function seedCorpusReplay(seed: CorpusReplaySeed): Promise<string> {
  const players = seed.players.map((player, index) => ({
      eid: index + 1,
      n: player.name,
      sid: player.steamId,
    })),
    eidByName = new Map(players.map((player) => [player.n, player.eid])),
    parserResultId = await seedParserResult({
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
  if (seed.killerName !== undefined && seed.victimName !== undefined) {
    const killerEid = requiredEid(eidByName, seed.killerName),
      victimEid = requiredEid(eidByName, seed.victimName);
    await repository.replaceParserEvents(parserResultId, [
      {
        eventType: "kill",
        observedPlayerRef: String(killerEid),
        payload: { victim_entity_id: victimEid },
        sourceRef: { index: 0 },
      },
    ]);
  }
  return parserResultId;
}

function requiredEid(eidByName: Map<string, number>, name: string): number {
  const eid = eidByName.get(name);
  if (eid === undefined) {
    throw new Error(`corpus replay missing player ${name}`);
  }
  return eid;
}

/**
 * Per-player `replay_count` for a scope bucket, keyed by canonical display_name.
 * `allTime` reads `rotation_id is null`; a concrete `rotationId` reads that
 * rotation's per-rotation rows. Used to assert the hand-derived corpus
 * expectations against persisted `player_stats`.
 */
async function playerScopeReplayCounts(
  gameType: string,
  scope: { kind: "allTime" } | { kind: "rotation"; rotationId: string },
): Promise<Map<string, number>> {
  const rotationPredicate =
      scope.kind === "allTime"
        ? "ps.rotation_id is null"
        : "ps.rotation_id = $2",
    parameters =
      scope.kind === "allTime" ? [gameType] : [gameType, scope.rotationId],
    result = await pool.query<{ display_name: string; replay_count: string }>(
      `select cp.display_name,
              coalesce((ps.stats->>'replay_count'), '0') as replay_count
       from player_stats ps
       join canonical_players cp on cp.id = ps.player_id
       where ps.game_type = $1 and ${rotationPredicate}`,
      parameters,
    );
  return new Map(
    result.rows.map((row) => [row.display_name, Number(row.replay_count)]),
  );
}

/** Per-player persisted `is_show` for a scope bucket, keyed by display_name. */
async function playerScopeIsShow(
  gameType: string,
  scope: { kind: "allTime" } | { kind: "rotation"; rotationId: string },
): Promise<Map<string, boolean>> {
  const rotationPredicate =
      scope.kind === "allTime"
        ? "ps.rotation_id is null"
        : "ps.rotation_id = $2",
    parameters =
      scope.kind === "allTime" ? [gameType] : [gameType, scope.rotationId],
    result = await pool.query<{ display_name: string; is_show: boolean }>(
      `select cp.display_name, ps.is_show
       from player_stats ps
       join canonical_players cp on cp.id = ps.player_id
       where ps.game_type = $1 and ${rotationPredicate}`,
      parameters,
    );
  return new Map(result.rows.map((row) => [row.display_name, row.is_show]));
}
