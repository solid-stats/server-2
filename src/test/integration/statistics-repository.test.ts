/* eslint-disable camelcase, no-magic-numbers, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../config/env.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { PgStatisticsRepository } from "../../modules/statistics/repository.js";

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
    truncate parser_events, parser_results, parse_jobs, replays,
      ingest_staging_records cascade
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
});

async function seedParserResult(): Promise<string> {
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
    replay = await pool.query<{ id: string }>(
      `
        insert into replays (
          source_system, source_replay_id, object_key, checksum, size_bytes,
          promoted_from_staging_id
        )
        values ('source', 'replay', 'raw/replay.ocap.json', $1, 123, $2)
        returning id
      `,
      ["1".repeat(64), staging.rows[0]?.id],
    ),
    parserResult = await pool.query<{ id: string }>(
      `
        insert into parser_results (
          replay_id, parser_contract_version, raw_snapshot
        )
        values ($1, '3.0.0', '{}')
        returning id
      `,
      [replay.rows[0]?.id],
    );

  const parserResultId = parserResult.rows[0]?.id;
  if (parserResultId === undefined) {
    throw new Error("parser result seed failed");
  }
  return parserResultId;
}
