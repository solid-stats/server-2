/* eslint-disable camelcase, max-lines, max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { runMigrations } from "../../../infra/db/migrate.js";
import { PgPublicStatsReadModel } from "../repository.js";

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
  readModel = new PgPublicStatsReadModel(pool);

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate bounty_points, commander_side_stats, player_stats, squad_stats,
      parser_events, parser_results, parse_jobs, replays,
      ingest_staging_records, squad_memberships, squads, player_steam_ids,
      player_nicknames, canonical_players, rotations cascade
  `);
  await seedPublicStats();
});

describe("PgPublicStatsReadModel", () => {
  it("reads overview and rotations", async () => {
    await expect(readModel.getOverview({})).resolves.toMatchObject({
      filters: { rotationId: null },
      totals: {
        bountyPlayers: 1,
        commanderSides: 2,
        parsedReplays: 1,
        players: 2,
        playerStatRows: 2,
        replays: 2,
        squads: 1,
        squadStatRows: 1,
      },
    });
    await expect(readModel.getOverview({ rotationId })).resolves.toMatchObject({
      filters: { rotationId },
      totals: {
        parsedReplays: 1,
        playerStatRows: 2,
        replays: 1,
      },
    });
    await expect(readModel.listRotations()).resolves.toEqual([
      {
        endsAt: null,
        id: otherRotationId,
        name: "Rotation 2",
        startsAt: "2026-06-01T00:00:00.000Z",
      },
      {
        endsAt: "2026-06-01T00:00:00.000Z",
        id: rotationId,
        name: "Rotation 1",
        startsAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
  });

  it("reads player lists and profiles", async () => {
    await expect(
      readModel.listPlayers({ search: "alp" }, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          displayName: "Alpha",
          id: playerAlphaId,
          rotationId: null,
          stats: { kills: 3, replayCount: 2 },
        },
      ],
      total: 1,
    });
    await expect(
      readModel.listPlayers(
        { rotationId, search: "alias" },
        { page: 1, pageSize: 10 },
      ),
    ).resolves.toMatchObject({
      items: [{ displayName: "Alpha", rotationId, stats: { kills: 3 } }],
      total: 1,
    });
    await expect(
      readModel.getPlayer(playerAlphaId, { rotationId }),
    ).resolves.toEqual({
      aliases: ["Alias Alpha"],
      displayName: "Alpha",
      id: playerAlphaId,
      rotationId,
      stats: {
        deaths: { byTeamkills: 0, total: 1 },
        kills: 3,
        replayCount: 2,
        teamkills: 0,
      },
      steamIds: ["steam-alpha"],
    });
    await expect(
      readModel.listPlayers(
        { rotationId: otherRotationId },
        { page: 1, pageSize: 10 },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          displayName: "Alpha",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
        {
          displayName: "Bravo",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
      ],
    });
    await expect(
      readModel.getPlayer("00000000-0000-4000-8000-000000009999", {}),
    ).resolves.toBeNull();
  });

  it("reads squad lists and profiles", async () => {
    await expect(
      readModel.listSquads({ search: "alpha" }, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: squadId,
          name: "Alpha Squad",
          rotationId: null,
          stats: { kills: 5, playerCount: 2 },
        },
      ],
      total: 1,
    });
    await expect(readModel.getSquad(squadId, { rotationId })).resolves.toEqual({
      id: squadId,
      name: "Alpha Squad",
      players: [
        { displayName: "Alpha", id: playerAlphaId },
        { displayName: "Bravo", id: playerBravoId },
      ],
      rotationId,
      stats: {
        deaths: { byTeamkills: 1, total: 2 },
        kills: 5,
        playerCount: 2,
        replayCount: 3,
        teamkills: 1,
      },
    });
    await expect(
      readModel.listSquads(
        { rotationId: otherRotationId },
        { page: 1, pageSize: 10 },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          name: "Alpha Squad",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            playerCount: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
      ],
    });
    await expect(
      readModel.getSquad("00000000-0000-4000-8000-000000009998", {}),
    ).resolves.toBeNull();
  });

  it("reads commander sides, bounty pages, and leaderboards", async () => {
    await expect(readModel.listCommanderSides({})).resolves.toEqual([
      {
        knownLosses: 0,
        knownWins: 1,
        player: null,
        rotationId,
        side: "east",
        unknownOutcomes: 1,
      },
      {
        knownLosses: 1,
        knownWins: 2,
        player: { displayName: "Alpha", id: playerAlphaId },
        rotationId,
        side: "west",
        unknownOutcomes: 0,
      },
    ]);
    await expect(
      readModel.listBounty({ rotationId }, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          player: { displayName: "Alpha", id: playerAlphaId },
          points: 7.5,
          rotationId,
        },
      ],
      total: 1,
    });
    await expect(
      readModel.getLeaderboards({ limit: 1, rotationId }),
    ).resolves.toMatchObject({
      bounty: [{ points: 7.5 }],
      playersByKills: [{ displayName: "Alpha", stats: { kills: 3 } }],
      rotationId,
      squadsByKills: [{ name: "Alpha Squad", stats: { kills: 5 } }],
    });
    await expect(
      readModel.getLeaderboards({ limit: 1 }),
    ).resolves.toMatchObject({
      rotationId: null,
    });
  });
});

const rotationId = "00000000-0000-4000-8000-000000000501",
  otherRotationId = "00000000-0000-4000-8000-000000000502",
  playerAlphaId = "00000000-0000-4000-8000-000000000601",
  playerBravoId = "00000000-0000-4000-8000-000000000602",
  squadId = "00000000-0000-4000-8000-000000000701",
  replayId = "00000000-0000-4000-8000-000000000801",
  otherReplayId = "00000000-0000-4000-8000-000000000802";

async function seedPublicStats(): Promise<void> {
  await pool.query(
    `
      insert into rotations (id, name, starts_at, ends_at)
      values
        ($1, 'Rotation 1', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
        ($2, 'Rotation 2', '2026-06-01T00:00:00.000Z', null)
    `,
    [rotationId, otherRotationId],
  );
  await pool.query(
    `
      insert into canonical_players (id, display_name)
      values ($1, 'Alpha'), ($2, 'Bravo')
    `,
    [playerAlphaId, playerBravoId],
  );
  await pool.query(
    `
      insert into player_nicknames (player_id, nickname)
      values ($1, 'Alias Alpha')
    `,
    [playerAlphaId],
  );
  await pool.query(
    `
      insert into player_steam_ids (player_id, steam_id)
      values ($1, 'steam-alpha')
    `,
    [playerAlphaId],
  );
  await pool.query("insert into squads (id, name) values ($1, 'Alpha Squad')", [
    squadId,
  ]);
  await pool.query(
    `
      insert into squad_memberships (squad_id, player_id, valid_from)
      values ($1, $2, '2026-05-01T00:00:00.000Z'), ($1, $3, '2026-05-01T00:00:00.000Z')
    `,
    [squadId, playerAlphaId, playerBravoId],
  );
  await pool.query(
    `
      insert into replays (
        id, source_system, source_replay_id, object_key, checksum, size_bytes,
        replay_timestamp, rotation_id, status
      )
      values
        ($1, 'solidgames', 'replay-1', 'raw/replay-1.json', $3, 128, '2026-05-02T00:00:00.000Z', $5, 'parsed'),
        ($2, 'solidgames', 'replay-2', 'raw/replay-2.json', $4, 128, '2026-06-02T00:00:00.000Z', $6, 'ready_for_parse')
    `,
    [
      replayId,
      otherReplayId,
      "a".repeat(64),
      "b".repeat(64),
      rotationId,
      otherRotationId,
    ],
  );
  await pool.query(
    `
      insert into player_stats (rotation_id, player_id, stats)
      values
        ($1, $2, $4),
        ($1, $3, $5)
    `,
    [
      rotationId,
      playerAlphaId,
      playerBravoId,
      {
        deaths: { by_teamkills: 0, total: 1 },
        kills: 3,
        replay_count: 2,
        teamkills: 0,
      },
      {
        deaths: { by_teamkills: 1, total: 2 },
        kills: 1,
        replay_count: 1,
        teamkills: 1,
      },
    ],
  );
  await pool.query(
    `
      insert into squad_stats (rotation_id, squad_id, stats)
      values ($1, $2, $3)
    `,
    [
      rotationId,
      squadId,
      {
        deaths: { by_teamkills: 1, total: 2 },
        kills: 5,
        player_count: 2,
        replay_count: 3,
        teamkills: 1,
      },
    ],
  );
  await pool.query(
    `
      insert into commander_side_stats (
        rotation_id, player_id, side, known_wins, known_losses, unknown_outcomes
      )
      values ($1, $2, 'west', 2, 1, 0), ($1, null, 'east', 1, 0, 1)
    `,
    [rotationId, playerAlphaId],
  );
  await pool.query(
    "insert into bounty_points (rotation_id, player_id, points) values ($1, $2, 7.50)",
    [rotationId, playerAlphaId],
  );
}
