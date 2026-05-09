/* eslint-disable @typescript-eslint/prefer-promise-reject-errors, camelcase, max-classes-per-file, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  parseRequestedRoutingKey,
  parserExchange,
  type ConfirmingPublisher,
  type ParseRequestMessage,
} from "../../infra/queue/messages.js";

import { ParseJobPublisher, type ParseJobRepository } from "./publisher.js";

import type { ParseJobRecord } from "./types.js";

const parseJob: ParseJobRecord = {
  attempts: 0,
  checksum: "a".repeat(64),
  createdAt: "2026-05-09T00:00:00.000Z",
  error: null,
  finishedAt: null,
  id: "00000000-0000-4000-8000-000000000201",
  objectKey: "raw/replay-1.ocap.json",
  parserContractVersion: "3.0.0",
  publishedAt: null,
  replayId: "00000000-0000-4000-8000-000000000101",
  startedAt: null,
  status: "queued",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

describe("ParseJobPublisher", () => {
  it("publishes parser contract payloads and marks jobs published", async () => {
    const repository = new FakeParseJobRepository([parseJob]),
      publisher = new FakePublisher(),
      service = new ParseJobPublisher(repository, publisher);

    const messages = await service.publishQueued({ batchSize: 5 });

    expect(messages).toEqual([
      {
        checksum: { algorithm: "sha256", value: parseJob.checksum },
        job_id: parseJob.id,
        object_key: parseJob.objectKey,
        parser_contract_version: "3.0.0",
        replay_id: parseJob.replayId,
      },
    ]);
    expect(publisher.calls).toEqual([
      {
        exchange: parserExchange,
        payload: messages[0],
        routingKey: parseRequestedRoutingKey,
      },
    ]);
    expect(repository.publishedJobs).toEqual([parseJob.id]);
  });

  it("keeps publish failures retryable without marking parser failure", async () => {
    const repository = new FakeParseJobRepository([parseJob]),
      publisher = new FakePublisher(new Error("broker unavailable")),
      service = new ParseJobPublisher(repository, publisher);

    const messages = await service.publishQueued({ batchSize: 5 });

    expect(messages).toEqual([]);
    expect(repository.failedJobs).toEqual([
      {
        error: {
          category: "publish_failed",
          message: "broker unavailable",
          retryable: true,
        },
        jobId: parseJob.id,
      },
    ]);
    expect(repository.publishedJobs).toEqual([]);
  });

  it("uses a generic publish error message for non-Error failures", async () => {
    const repository = new FakeParseJobRepository([parseJob]),
      publisher = new FakePublisher("failed"),
      service = new ParseJobPublisher(repository, publisher);

    await service.publishQueued({ batchSize: 5 });

    expect(repository.failedJobs[0]?.error).toMatchObject({
      message: "RabbitMQ publish failed",
    });
  });
});

class FakeParseJobRepository implements ParseJobRepository {
  public failedJobs: {
    error: Record<string, unknown>;
    jobId: string;
  }[] = [];

  public publishedJobs: string[] = [];

  public constructor(private readonly jobs: ParseJobRecord[]) {}

  public listPublishableJobs(): Promise<ParseJobRecord[]> {
    return Promise.resolve(this.jobs);
  }

  public markJobPublished(jobId: string): Promise<void> {
    this.publishedJobs.push(jobId);
    return Promise.resolve();
  }

  public markJobPublishFailed(
    jobId: string,
    error: Record<string, unknown>,
  ): Promise<void> {
    this.failedJobs.push({ error, jobId });
    return Promise.resolve();
  }
}

class FakePublisher implements ConfirmingPublisher {
  public calls: {
    exchange: string;
    payload: ParseRequestMessage | undefined;
    routingKey: string;
  }[] = [];

  public constructor(private readonly error?: Error | string) {}

  public publishJson(
    exchange: string,
    routingKey: string,
    payload: ParseRequestMessage,
  ): Promise<void> {
    this.calls.push({ exchange, payload, routingKey });
    return this.error === undefined
      ? Promise.resolve()
      : Promise.reject(this.error);
  }
}
