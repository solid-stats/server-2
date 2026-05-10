import "dotenv/config";

import { buildApp, createDefaultAuthOptions } from "./app.js";
import { loadConfig, redactConfigForLogs } from "./config/env.js";
import {
  createDatabaseHealthCheck,
  createDatabasePool,
} from "./infra/db/client.js";
import {
  createStaticHealthCheck,
  type HealthCheckable,
} from "./infra/health.js";
import { createLoggerOptions } from "./infra/logging/logger.js";
import { createQueueClient } from "./infra/queue/client.js";
import { createStorageClient } from "./infra/storage/client.js";
import { PgIngestRepository } from "./modules/ingest/repository/repository.js";
import { NoopAuditPatchRecalculator } from "./modules/requests/routes/audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "./modules/requests/routes/memory.js";
import { EmptyReferenceValidator } from "./modules/requests/routes/reference-validator.js";

const config = loadConfig(),
  databasePool = createDatabasePool(config),
  ingestRepository = new PgIngestRepository(databasePool),
  requestStore = new InMemoryPlayerRequestRepository(),
  storage = createStorageClient(config),
  checks: Record<string, HealthCheckable> = {
    db: createDatabaseHealthCheck(databasePool),
    parser: createStaticHealthCheck(),
    queue: createQueueClient(config),
    storage,
  },
  app = await buildApp({
    auth: createDefaultAuthOptions(config.auth),
    checks,
    ingestCommands: {
      createManualReparse: (input) =>
        ingestRepository.createManualReparse(
          input.replayId,
          input.parserContractVersion,
          input.actorUserId,
          reasonDetails(input.reason),
        ),
      retryParseJob: (input) =>
        ingestRepository.retryParseJob(
          input.jobId,
          input.actorUserId,
          reasonDetails(input.reason),
        ),
    },
    ingestReadModel: ingestRepository,
    logger: createLoggerOptions(config),
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

function reasonDetails(reason: string | undefined): Record<string, unknown> {
  return reason === undefined ? {} : { reason };
}
