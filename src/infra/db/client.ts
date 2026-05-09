import { Pool } from "pg";

import type { AppConfig } from "../../config/env.js";
import type { HealthCheckable, HealthCheckResult } from "../health.js";

export function createDbClient(config: AppConfig): HealthCheckable {
  const pool = new Pool({
    connectionString: config.databaseUrl
  });

  return {
    async check(): Promise<HealthCheckResult> {
      await pool.query("select 1");
      return { status: "ok" };
    },
    async close(): Promise<void> {
      await pool.end();
    }
  };
}
