/* eslint-disable camelcase */
import {
  parseRequestedQueue,
  parseRequestedRoutingKey,
  parserExchange,
  type ConfirmingPublisher,
  type ParseRequestMessage,
} from "../../infra/queue/messages.js";

import type { ParseJobRecord } from "./types.js";

export interface ParseJobRepository {
  listPublishableJobs(limit: number): Promise<ParseJobRecord[]>;
  markJobPublished(jobId: string): Promise<void>;
  markJobPublishFailed(
    jobId: string,
    error: Record<string, unknown>,
  ): Promise<void>;
}

export interface ParseJobPublisherOptions {
  batchSize: number;
}

export interface ParseJobPublisherObserver {
  jobFailed(job: ParseJobRecord, error: Record<string, unknown>): void;
  jobPublished(job: ParseJobRecord): void;
  queueDepth(queue: string, depth: number): void;
}

export interface ParseJobPublisherLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export interface ParseJobPublisherRuntimeOptions {
  logger?: ParseJobPublisherLogger;
  observer?: ParseJobPublisherObserver;
}

const noopObserver: ParseJobPublisherObserver = {
    jobFailed(job, error) {
      void job;
      void error;
    },
    jobPublished(job) {
      void job;
    },
    queueDepth(queue, depth) {
      void queue;
      void depth;
    },
  },
  noopLogger: ParseJobPublisherLogger = {
    error(bindings, message) {
      void bindings;
      void message;
    },
    info(bindings, message) {
      void bindings;
      void message;
    },
  };

export class ParseJobPublisher {
  private readonly logger: ParseJobPublisherLogger;

  private readonly observer: ParseJobPublisherObserver;

  public constructor(
    private readonly repository: ParseJobRepository,
    private readonly publisher: ConfirmingPublisher,
    runtimeOptions: ParseJobPublisherRuntimeOptions = {},
  ) {
    this.logger = runtimeOptions.logger ?? noopLogger;
    this.observer = runtimeOptions.observer ?? noopObserver;
  }

  public async publishQueued(
    options: ParseJobPublisherOptions,
  ): Promise<ParseRequestMessage[]> {
    const jobs = await this.repository.listPublishableJobs(options.batchSize),
      published: ParseRequestMessage[] = [];
    this.observer.queueDepth(parseRequestedQueue, jobs.length);

    for (const job of jobs) {
      const message = toParseRequestMessage(job);
      try {
        await this.publisher.publishJson(
          parserExchange,
          parseRequestedRoutingKey,
          message,
        );
        await this.repository.markJobPublished(job.id);
        this.observer.jobPublished(job);
        this.logger.info(parseJobLogBindings(job), "parser job published");
        published.push(message);
      } catch (error) {
        const serializedError = publishError(error);
        await this.repository.markJobPublishFailed(job.id, serializedError);
        this.observer.jobFailed(job, serializedError);
        this.logger.error(
          {
            ...parseJobLogBindings(job),
            error: serializedError,
          },
          "parser job publish failed",
        );
      }
    }

    return published;
  }
}

function parseJobLogBindings(job: ParseJobRecord): Record<string, unknown> {
  return {
    job_id: job.id,
    object_key: job.objectKey,
    parser_contract_version: job.parserContractVersion,
    replay_id: job.replayId,
  };
}

function toParseRequestMessage(job: ParseJobRecord): ParseRequestMessage {
  return {
    checksum: {
      algorithm: "sha256",
      value: job.checksum,
    },
    job_id: job.id,
    object_key: job.objectKey,
    parser_contract_version: job.parserContractVersion,
    replay_id: job.replayId,
  };
}

function publishError(error: unknown): Record<string, unknown> {
  return {
    category: "publish_failed",
    message: error instanceof Error ? error.message : "RabbitMQ publish failed",
    retryable: true,
  };
}
