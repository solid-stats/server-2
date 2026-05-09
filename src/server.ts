import "dotenv/config";

import { buildApp } from "./app.js";
import { loadConfig, redactConfigForLogs } from "./config/env.js";
import { createDbClient } from "./infra/db/client.js";
import type { HealthCheckable } from "./infra/health.js";
import { createLoggerOptions } from "./infra/logging/logger.js";
import { createQueueClient } from "./infra/queue/client.js";
import { createStorageClient } from "./infra/storage/client.js";

const config = loadConfig();
const checks: Record<string, HealthCheckable> = {
  db: createDbClient(config),
  queue: createQueueClient(config),
  storage: createStorageClient(config),
};

const app = await buildApp({
  logger: createLoggerOptions(config),
  checks,
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  await app.close();
  await Promise.all(Object.values(checks).map((check) => check.close()));
}

process.once("SIGINT", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});

process.once("SIGTERM", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});

await app.listen({
  host: config.host,
  port: config.port,
});

app.log.info({ config: redactConfigForLogs(config) }, "server started");
