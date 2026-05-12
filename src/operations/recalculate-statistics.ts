import "dotenv/config";

import { Pool } from "pg";

import { loadConfig } from "../config/env.js";
import { PgFullRunStatisticsRepository } from "../modules/statistics/repository/full-run.js";
import { FullRunRecalculationService } from "../modules/statistics/service/full-run-recalculation.js";

export async function runStatisticsRecalculationOperation(
  operationArguments: readonly string[] = process.argv.slice(2),
  write: (content: string) => void = (content) => process.stdout.write(content),
): Promise<number> {
  const config = loadConfig(),
    pool = new Pool({ connectionString: config.databaseUrl });

  try {
    const repository = new PgFullRunStatisticsRepository(pool),
      service = new FullRunRecalculationService(repository),
      report = operationArguments.includes("--dry-run")
        ? await service.coverageReport()
        : await service.recalculateAllCurrentParserResults();

    write(`${JSON.stringify(report, undefined, 2)}\n`);
    return report.mode === "recalculate" && report.summary.failureCount > 0
      ? 1
      : 0;
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
  process.exitCode = await runStatisticsRecalculationOperation();
}
