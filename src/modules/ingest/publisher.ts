/* eslint-disable camelcase */
import {
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

export class ParseJobPublisher {
  public constructor(
    private readonly repository: ParseJobRepository,
    private readonly publisher: ConfirmingPublisher,
  ) {}

  public async publishQueued(
    options: ParseJobPublisherOptions,
  ): Promise<ParseRequestMessage[]> {
    const jobs = await this.repository.listPublishableJobs(options.batchSize),
      published: ParseRequestMessage[] = [];

    for (const job of jobs) {
      const message = toParseRequestMessage(job);
      try {
        await this.publisher.publishJson(
          parserExchange,
          parseRequestedRoutingKey,
          message,
        );
        await this.repository.markJobPublished(job.id);
        published.push(message);
      } catch (error) {
        await this.repository.markJobPublishFailed(job.id, publishError(error));
      }
    }

    return published;
  }
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
