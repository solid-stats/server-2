import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

interface MigrationRecord {
  id: string;
  checksum: string;
}

const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "migrations",
  ),
  defaultDatabaseUrl = "postgresql://solid:solid@localhost:15432/solid_stats";

export async function runMigrations(
  databaseUrl = process.env["DATABASE_URL"] ?? defaultDatabaseUrl,
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      create table if not exists schema_migrations (
        id text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationFiles = await readdir(migrationsDir);
    const files = migrationFiles
      .filter((file) => file.endsWith(".sql"))
      .toSorted();

    for (const file of files) {
      const id = file.replace(/\.sql$/u, "");
      const sql = await readFile(join(migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await pool.query<MigrationRecord>(
        "select id, checksum from schema_migrations where id = $1",
        [id],
      );

      if (existing.rowCount && existing.rows[0]?.checksum !== checksum) {
        throw new Error(`Migration ${id} checksum changed after apply`);
      }
      if (existing.rowCount) {
        continue;
      }

      await pool.query("begin");
      try {
        await pool.query(sql);
        await pool.query(
          "insert into schema_migrations (id, checksum) values ($1, $2)",
          [id, checksum],
        );
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

const [, entrypointPath] = process.argv;

if (
  entrypointPath !== undefined &&
  import.meta.url === `file://${entrypointPath}`
) {
  await runMigrations();
}
