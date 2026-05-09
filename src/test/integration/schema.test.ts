import { Pool } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../../config/env.js";
import { runMigrations } from "../../infra/db/migrate.js";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://solid:solid@localhost:15432/solid_stats",
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? "amqp://solid:solid@localhost:5673",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_BUCKET: process.env.S3_BUCKET ?? "solid-replays",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "solid",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "solidsecret",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "true"
};

const config = loadConfig(env);
const pool = new Pool({ connectionString: config.databaseUrl });

const requiredTables = [
  "schema_migrations",
  "users",
  "roles",
  "user_roles",
  "canonical_players",
  "player_nicknames",
  "player_steam_ids",
  "squads",
  "squad_memberships",
  "rotations",
  "ingest_staging_records",
  "replays",
  "parse_jobs",
  "parser_results",
  "parser_events",
  "player_stats",
  "squad_stats",
  "commander_side_stats",
  "bounty_points",
  "requests",
  "request_attachments",
  "moderation_actions",
  "audit_patches"
];

const requiredEnums = [
  "ingest_status",
  "replay_status",
  "parse_job_status",
  "parser_result_status",
  "request_status",
  "moderation_action_type"
];

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

describe("v1 domain schema", () => {
  it("creates all required lifecycle tables", async () => {
    const result = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1)
      `,
      [requiredTables]
    );

    expect(result.rows.map((row) => row.table_name).sort()).toEqual(requiredTables.sort());
  });

  it("creates lifecycle status enums", async () => {
    const result = await pool.query<{ typname: string }>(
      "select typname from pg_type where typname = any($1)",
      [requiredEnums]
    );

    expect(result.rows.map((row) => row.typname).sort()).toEqual(requiredEnums.sort());
  });

  it("preserves replay promotion evidence and object identity columns", async () => {
    const result = await pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_name = 'replays'
          and column_name = any($1)
      `,
      [["source_system", "source_replay_id", "object_key", "checksum", "size_bytes", "promotion_evidence"]]
    );

    expect(result.rows.map((row) => row.column_name).sort()).toEqual([
      "checksum",
      "object_key",
      "promotion_evidence",
      "size_bytes",
      "source_replay_id",
      "source_system"
    ]);
  });

  it("models player identity and squad membership as timestamped history", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `
        select table_name, column_name
        from information_schema.columns
        where (table_name = 'player_nicknames' and column_name in ('nickname', 'observed_from', 'observed_to', 'evidence'))
           or (table_name = 'player_steam_ids' and column_name in ('steam_id', 'observed_from', 'observed_to', 'evidence'))
           or (table_name = 'squad_memberships' and column_name in ('valid_from', 'valid_to', 'evidence'))
      `
    );

    const columns = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
    expect(columns).toContain("player_nicknames.nickname");
    expect(columns).toContain("player_nicknames.observed_from");
    expect(columns).toContain("player_steam_ids.steam_id");
    expect(columns).toContain("player_steam_ids.observed_to");
    expect(columns).toContain("squad_memberships.valid_from");
    expect(columns).toContain("squad_memberships.valid_to");
  });

  it("links moderation decisions to audit patches and affected entities", async () => {
    const result = await pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_name = 'audit_patches'
          and column_name = any($1)
      `,
      [["moderation_action_id", "affected_entity_type", "affected_entity_id", "patch", "reason"]]
    );

    expect(result.rows.map((row) => row.column_name).sort()).toEqual([
      "affected_entity_id",
      "affected_entity_type",
      "moderation_action_id",
      "patch",
      "reason"
    ]);
  });
});
