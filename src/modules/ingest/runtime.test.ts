/* eslint-disable @typescript-eslint/no-empty-function, camelcase, no-magic-numbers, no-use-before-define */
import { describe, expect, it, vi } from "vitest";

import { createIngestRuntime } from "./runtime.js";

import type { PgIngestRepository } from "./repository/repository.js";
import type {
  ParseCompletedMessage,
  ParseFailedMessage,
} from "../../infra/queue/messages.js";
import type { ParserResultHandlers } from "../../infra/queue/rabbitmq.js";

describe("ingest runtime", () => {
  it("starts promotion/publish loops, consumes parser results, and closes", async () => {
    vi.useFakeTimers();
    try {
      const repository = repositoryDouble(),
        queue = queueDouble(),
        runtime = await createIngestRuntime({
          logger: {
            error: vi.fn(),
            info: vi.fn(),
          },
          parserContractVersion: "3.0.0",
          pollIntervalMs: 100,
          promotionBatchSize: 2,
          publishBatchSize: 3,
          queue,
          repository: repository as unknown as PgIngestRepository,
        });

      expect(queue.consumeParserResults).toHaveBeenCalledOnce();
      await queue.handlers?.completed(completedMessage);
      await queue.handlers?.failed(failedMessage);
      expect(repository.recordParserCompleted).toHaveBeenCalledWith(
        completedMessage,
      );
      expect(repository.recordParserFailed).toHaveBeenCalledWith(failedMessage);

      runtime.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(repository.claimPendingStagingRecords).toHaveBeenCalledWith(2);
      expect(repository.listPublishableJobs).toHaveBeenCalledWith(3);

      await runtime.close();
      await vi.advanceTimersByTimeAsync(100);
      expect(repository.claimPendingStagingRecords).toHaveBeenCalledTimes(1);
      expect(repository.listPublishableJobs).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

const completedMessage: ParseCompletedMessage = {
    artifact: {
      bucket: "solid-replays",
      key: "artifacts/replay.json",
    },
    artifact_checksum: { algorithm: "sha256", value: "b".repeat(64) },
    artifact_size_bytes: 128,
    job_id: "job-1",
    message_type: "parse.completed",
    parser_contract_version: "3.0.0",
    replay_id: "replay-1",
    source_checksum: { algorithm: "sha256", value: "a".repeat(64) },
  },
  failedMessage: ParseFailedMessage = {
    failure: {
      error_code: "parse_error",
      message: "failed",
      retryability: "retryable",
      stage: "parse",
    },
    job_id: { state: "present", value: "job-2" },
    message_type: "parse.failed",
    parser_contract_version: { state: "present", value: "3.0.0" },
    replay_id: { state: "present", value: "replay-2" },
  };

function repositoryDouble() {
  return {
    claimPendingStagingRecords: vi.fn(async () => []),
    listPublishableJobs: vi.fn(async () => []),
    recordParserCompleted: vi.fn(async () => true),
    recordParserFailed: vi.fn(async () => true),
  };
}

function queueDouble() {
  const queue = {
    consumeParserResults: vi.fn(async (handlers: ParserResultHandlers) => {
      queue.handlers = handlers;
    }),
    close: vi.fn(async () => {}),
    handlers: undefined as ParserResultHandlers | undefined,
    publishJson: vi.fn(async () => {}),
  };
  return queue;
}
