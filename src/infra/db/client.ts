import { Pool } from "pg";

import type { AppConfig } from "../../config/env.js";
import type { HealthCheckResult, HealthCheckable } from "../health.js";

export function createDatabasePool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
  });
}

export function createDbClient(config: AppConfig): HealthCheckable {
  const pool = createDatabasePool(config);

  return {
    async check(): Promise<HealthCheckResult> {
      await pool.query("select 1");
      return { status: "ok" };
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
