import "dotenv/config";

import { buildApp, createDefaultAuthOptions } from "./app.js";
import { loadConfig, redactConfigForLogs } from "./config/env.js";
import { createDbClient as createDatabaseClient } from "./infra/db/client.js";
import {
  createStaticHealthCheck,
  type HealthCheckable,
} from "./infra/health.js";
import { createLoggerOptions } from "./infra/logging/logger.js";
import { createQueueClient } from "./infra/queue/client.js";
import { createStorageClient } from "./infra/storage/client.js";
import { NoopAuditPatchRecalculator } from "./modules/requests/routes/audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "./modules/requests/routes/memory.js";
import { EmptyReferenceValidator } from "./modules/requests/routes/reference-validator.js";

const config = loadConfig(),
  requestStore = new InMemoryPlayerRequestRepository(),
  storage = createStorageClient(config),
  checks: Record<string, HealthCheckable> = {
    db: createDatabaseClient(config),
    parser: createStaticHealthCheck(),
    queue: createQueueClient(config),
    storage,
  },
  app = await buildApp({
    auth: createDefaultAuthOptions(config.auth),
    logger: createLoggerOptions(config),
    checks,
    requests: {
      attachmentStorage: storage,
      attachments: requestStore,
      auditPatches: requestStore,
      auditRecalculator: new NoopAuditPatchRecalculator(),
      moderation: requestStore,
      references: new EmptyReferenceValidator(),
      requests: requestStore,
      workflows: requestStore,
    },
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
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
