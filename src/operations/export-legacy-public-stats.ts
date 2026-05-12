import "dotenv/config";

import { Pool } from "pg";

import { loadConfig } from "../config/env.js";
import { LegacyPublicStatsExportService } from "../modules/statistics/export/legacy-public-export.js";
import { PgLegacyPublicStatsExportRepository } from "../modules/statistics/repository/legacy-export.js";

interface LegacyExportOperationOptions {
  corpusScope: string;
  generatedAt: Date;
}

export async function runLegacyPublicStatsExportOperation(
  operationArguments: readonly string[] = process.argv.slice(2),
  write: (content: string) => void = (content) => process.stdout.write(content),
  now: () => Date = () => new Date(),
): Promise<number> {
  const options = parseOperationArguments(operationArguments, now),
    config = loadConfig(),
    pool = new Pool({ connectionString: config.databaseUrl });

  try {
    const repository = new PgLegacyPublicStatsExportRepository(pool),
      service = new LegacyPublicStatsExportService(repository),
      report = await service.export(options);

    write(`${JSON.stringify(report, undefined, 2)}\n`);
    return 0;
  } finally {
    await pool.end();
  }
}

export function parseOperationArguments(
  operationArguments: readonly string[],
  now: () => Date = () => new Date(),
): LegacyExportOperationOptions {
  return {
    corpusScope:
      argumentValue(operationArguments, "--corpus-scope") ?? "current",
    generatedAt: generatedAt(operationArguments, now),
  };
}

function generatedAt(
  operationArguments: readonly string[],
  now: () => Date,
): Date {
  const value = argumentValue(operationArguments, "--generated-at");
  if (value === undefined) {
    return now();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid --generated-at value: ${value}`);
  }
  return parsed;
}

function argumentValue(
  operationArguments: readonly string[],
  name: string,
): string | undefined {
  if (!operationArguments.includes(name)) {
    return undefined;
  }
  const index = operationArguments.indexOf(name);
  const value = operationArguments[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

const [, entrypointPath] = process.argv;

/* v8 ignore next 6 -- exercised by the package script entrypoint. */
if (
  entrypointPath !== undefined &&
  import.meta.url === `file://${entrypointPath}`
) {
  process.exitCode = await runLegacyPublicStatsExportOperation();
}
