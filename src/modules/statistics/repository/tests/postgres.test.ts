/* eslint-disable camelcase, id-length, max-lines, max-lines-per-function, no-magic-numbers, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import { runMigrations } from "../../../../infra/db/migrate.js";
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
  repository = new PgStatisticsRepository(pool);

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate commander_side_stats, player_stats, squad_stats, parser_events,
      parser_results, parse_jobs, replays, ingest_staging_records,
      squad_memberships, squads, player_steam_ids, canonical_players,
      rotations cascade
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
});

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
}

async function seedParserResult(seed: ParserResultSeed = {}): Promise<string> {
  const staging = await pool.query<{ id: string }>(
      `
        insert into ingest_staging_records (
          source_system, source_replay_id, object_key, checksum, size_bytes
        )
        values ('source', 'replay', 'raw/replay.ocap.json', $1, 123)
        returning id
      `,
      ["1".repeat(64)],
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
        values ('source', 'replay', 'raw/replay.ocap.json', $1, 123, $2, $3)
        returning id
      `,
      ["1".repeat(64), staging.rows[0]?.id, replayTimestamp],
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
  const result = await pool.query<{ id: string }>(
    `
      insert into rotations (name, starts_at, ends_at)
      values ('Rotation 1', '2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z')
      returning id
    `,
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

function requiredId(id: string | undefined, message: string): string {
  if (id === undefined) {
    throw new Error(message);
  }
  return id;
}
