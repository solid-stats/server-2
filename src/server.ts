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
import { createRabbitMqParserRuntime } from "./infra/queue/rabbitmq.js";
import { createStorageClient } from "./infra/storage/client.js";
import { PgIngestRepository } from "./modules/ingest/repository/repository.js";
import { createIngestRuntime } from "./modules/ingest/runtime.js";
import { NoopAuditPatchRecalculator } from "./modules/requests/routes/audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "./modules/requests/routes/memory.js";
import { EmptyReferenceValidator } from "./modules/requests/routes/reference-validator.js";

const config = loadConfig(),
  databasePool = createDatabasePool(config),
  ingestRepository = new PgIngestRepository(databasePool),
  logger = createLoggerOptions(config),
  requestStore = new InMemoryPlayerRequestRepository(),
  queueRuntime = await createRabbitMqParserRuntime(config),
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
    logger,
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
  }),
  ingestRuntime = await createIngestRuntime({
    logger: app.log,
    parserContractVersion: config.ingest.parserContractVersion,
    pollIntervalMs: config.ingest.pollIntervalMs,
    promotionBatchSize: config.ingest.promotionBatchSize,
    publishBatchSize: config.ingest.publishBatchSize,
    queue: queueRuntime,
    repository: ingestRepository,
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  await ingestRuntime.close();
  await app.close();
  await queueRuntime.close();
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

ingestRuntime.start();
app.log.info({ config: redactConfigForLogs(config) }, "server started");

function reasonDetails(reason: string | undefined): Record<string, unknown> {
  return reason === undefined ? {} : { reason };
}
