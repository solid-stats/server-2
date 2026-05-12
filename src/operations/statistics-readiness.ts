import "dotenv/config";

import { Pool } from "pg";

import { loadConfig } from "../config/env.js";
import { StatisticsReadinessService } from "../modules/statistics/readiness/readiness.js";
import { PgStatisticsReadinessRepository } from "../modules/statistics/repository/readiness.js";

export async function runStatisticsReadinessOperation(
  write: (content: string) => void = (content) => process.stdout.write(content),
): Promise<number> {
  const config = loadConfig(),
    pool = new Pool({ connectionString: config.databaseUrl });

  try {
    const repository = new PgStatisticsReadinessRepository(pool),
      service = new StatisticsReadinessService(repository),
      report = await service.report();
    write(`${JSON.stringify(report, undefined, 2)}\n`);
    return 0;
  } finally {
    await pool.end();
  }
}

const [, entrypointPath] = process.argv;

/* v8 ignore next 6 -- exercised by the package script entrypoint. */
if (
  entrypointPath !== undefined &&
  import.meta.url === `file://${entrypointPath}`
) {
  process.exitCode = await runStatisticsReadinessOperation();
}
