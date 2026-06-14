import { Pool } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

interface ColumnInfo {
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
}

import { loadConfig } from "../../config/env.js";
import { runMigrations } from "../../infra/db/migrate.js";

const env = {
    DATABASE_URL:
      process.env["DATABASE_URL"] ??
      "postgresql://solid:solid@localhost:15432/solid_stats",
    RABBITMQ_URL:
      process.env["RABBITMQ_URL"] ?? "amqp://solid:solid@localhost:5673",
    S3_ENDPOINT: process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
    S3_REGION: process.env["S3_REGION"] ?? "us-east-1",
    S3_BUCKET: process.env["S3_BUCKET"] ?? "solid-replays",
    S3_ACCESS_KEY_ID: process.env["S3_ACCESS_KEY_ID"] ?? "solid",
    S3_SECRET_ACCESS_KEY: process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
    S3_FORCE_PATH_STYLE: process.env["S3_FORCE_PATH_STYLE"] ?? "true",
  },
  config = loadConfig(env),
  pool = new Pool({ connectionString: config.databaseUrl }),
  requiredTables = [
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
    "audit_patches",
  ],
  requiredEnums = [
    "ingest_status",
    "replay_status",
    "parse_job_status",
    "parser_result_status",
    "request_status",
    "moderation_action_type",
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
      [requiredTables],
    );

    expect(result.rows.map((row) => row.table_name).toSorted()).toEqual(
      requiredTables.toSorted(),
    );
  });

  it("creates lifecycle status enums", async () => {
    const result = await pool.query<{ typname: string }>(
      "select typname from pg_type where typname = any($1)",
      [requiredEnums],
    );

    expect(result.rows.map((row) => row.typname).toSorted()).toEqual(
      requiredEnums.toSorted(),
    );
  });

  it("adds processing as a claim status for ingest staging workers", async () => {
    const result = await pool.query<{ enumlabel: string }>(
      `
        select enumlabel
        from pg_enum
        join pg_type on pg_type.oid = pg_enum.enumtypid
        where pg_type.typname = 'ingest_status'
          and enumlabel = 'processing'
      `,
    );

    expect(result.rows).toHaveLength(1);
  });

  it("preserves replay promotion evidence and object identity columns", async () => {
    const result = await pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_name = 'replays'
          and column_name = any($1)
      `,
      [
        [
          "source_system",
          "source_replay_id",
          "object_key",
          "checksum",
          "size_bytes",
          "promotion_evidence",
        ],
      ],
    );

    expect(result.rows.map((row) => row.column_name).toSorted()).toEqual([
      "checksum",
      "object_key",
      "promotion_evidence",
      "size_bytes",
      "source_replay_id",
      "source_system",
    ]);
  });

  it("models player identity and squad membership as timestamped history", async () => {
    const result = await pool.query<{
        table_name: string;
        column_name: string;
      }>(
        `
        select table_name, column_name
        from information_schema.columns
        where (table_name = 'player_nicknames' and column_name in ('nickname', 'observed_from', 'observed_to', 'evidence'))
           or (table_name = 'player_steam_ids' and column_name in ('steam_id', 'observed_from', 'observed_to', 'evidence'))
           or (table_name = 'squad_memberships' and column_name in ('valid_from', 'valid_to', 'evidence'))
      `,
      ),
      columns = new Set(
        result.rows.map((row) => `${row.table_name}.${row.column_name}`),
      );
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
      [
        [
          "moderation_action_id",
          "affected_entity_type",
          "affected_entity_id",
          "patch",
          "reason",
        ],
      ],
    );

    expect(result.rows.map((row) => row.column_name).toSorted()).toEqual([
      "affected_entity_id",
      "affected_entity_type",
      "moderation_action_id",
      "patch",
      "reason",
    ]);
  });
});

const aggregateTables = [
  "player_stats",
  "squad_stats",
  "bounty_points",
  "commander_side_stats",
] as const;

async function columnInfo(
  table: string,
  column: string,
): Promise<ColumnInfo | undefined> {
  const result = await pool.query<ColumnInfo>(
    `
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_name = $1 and column_name = $2
    `,
    [table, column],
  );
  return result.rows[0];
}

describe("0008 game-type-aware aggregate schema", () => {
  it("adds a nullable canonical replays.game_type text column", async () => {
    const column = await columnInfo("replays", "game_type");
    expect(column).toBeDefined();
    expect(column?.data_type).toBe("text");
    expect(column?.is_nullable).toBe("YES");
  });

  it("adds game_type and makes rotation_id nullable on every aggregate table", async () => {
    for (const table of aggregateTables) {
      const gameType = await columnInfo(table, "game_type");
      expect(gameType, `${table}.game_type`).toBeDefined();
      expect(gameType?.data_type, `${table}.game_type`).toBe("text");

      const rotationId = await columnInfo(table, "rotation_id");
      expect(rotationId?.is_nullable, `${table}.rotation_id`).toBe("YES");
    }
  });

  it("adds player_stats.is_show as a non-null boolean defaulting to true", async () => {
    const column = await columnInfo("player_stats", "is_show");
    expect(column).toBeDefined();
    expect(column?.data_type).toBe("boolean");
    expect(column?.is_nullable).toBe("NO");
    expect(column?.column_default).toBe("true");
  });

  it("rejects duplicate all-time player_stats rows via NULLS NOT DISTINCT", async () => {
    const seeded = await pool.query<{ id: string }>(
      "insert into canonical_players (display_name) values ('schema-test-game-type') returning id",
    );
    const playerId = seeded.rows[0]?.id;
    expect(playerId).toBeDefined();

    try {
      // First all-time row (rotation_id NULL) for this player + game_type: allowed.
      await pool.query(
        `
          insert into player_stats (rotation_id, player_id, stats, game_type)
          values (null, $1, '{}'::jsonb, 'sg')
        `,
        [playerId],
      );

      // Duplicate all-time row must be rejected: NULLS NOT DISTINCT collapses the
      // NULL rotation_id so (NULL, player_id, 'sg') is treated as a single key.
      await expect(
        pool.query(
          `
            insert into player_stats (rotation_id, player_id, stats, game_type)
            values (null, $1, '{}'::jsonb, 'sg')
          `,
          [playerId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      // Cascades to player_stats rows seeded above.
      await pool.query("delete from canonical_players where id = $1", [
        playerId,
      ]);
    }
  });
});
