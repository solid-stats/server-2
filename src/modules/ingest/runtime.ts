import {
  IntervalTask,
  type IntervalTaskLogger,
} from "../../infra/runtime/interval-task.js";

import { ParseJobPublisher } from "./publisher.js";
import { IngestPromotionService } from "./service.js";

import type { PgIngestRepository } from "./repository/repository.js";
import type {
  ParseCompletedMessage,
  ParseFailedMessage,
} from "../../infra/queue/messages.js";
import type { RabbitMqParserRuntime } from "../../infra/queue/rabbitmq.js";

export interface IngestRuntimeOptions {
  logger: IntervalTaskLogger;
  parserContractVersion: string;
  promotionBatchSize: number;
  publishBatchSize: number;
  pollIntervalMs: number;
  queue: RabbitMqParserRuntime;
  repository: PgIngestRepository;
}

export interface IngestRuntime {
  close(): Promise<void>;
  start(): void;
}

export async function createIngestRuntime(
  options: IngestRuntimeOptions,
): Promise<IngestRuntime> {
  const promotionService = new IngestPromotionService(options.repository),
    publisher = new ParseJobPublisher(options.repository, options.queue, {
      logger: options.logger,
    }),
    promotionTask = new IntervalTask({
      intervalMs: options.pollIntervalMs,
      logger: options.logger,
      name: "ingest-promotion",
      task: async () => {
        await promotionService.promotePending({
          batchSize: options.promotionBatchSize,
          parserContractVersion: options.parserContractVersion,
        });
      },
    }),
    publishTask = new IntervalTask({
      intervalMs: options.pollIntervalMs,
      logger: options.logger,
      name: "parse-job-publisher",
      task: async () => {
        await publisher.publishQueued({ batchSize: options.publishBatchSize });
      },
    });

  await options.queue.consumeParserResults({
    completed: async (message: ParseCompletedMessage) => {
      await options.repository.recordParserCompleted(message);
    },
    failed: async (message: ParseFailedMessage) => {
      await options.repository.recordParserFailed(message);
    },
  });

  return {
    async close() {
      await Promise.all([promotionTask.close(), publishTask.close()]);
    },
    start() {
      promotionTask.start();
      publishTask.start();
    },
  };
}
