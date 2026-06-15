/* eslint-disable @typescript-eslint/no-empty-function, camelcase, no-magic-numbers, no-use-before-define, unicorn/no-null */
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
        artifactLoader = {
          loadParserArtifact: vi.fn(async () => parserArtifact),
        },
        queue = queueDouble(),
        recalculation = {
          recalculateParserResult: vi.fn(async () => ({
            bountyRows: 0,
            commanderStats: 0,
            normalizedEvents: 0,
            playerStats: 0,
            rotationId: null,
            squadStats: 0,
            status: "recalculated" as const,
          })),
        },
        runtime = await createIngestRuntime({
          artifactLoader,
          logger: {
            error: vi.fn(),
            info: vi.fn(),
          },
          parserContractVersion: "3.0.0",
          pollIntervalMs: 100,
          promotionBatchSize: 2,
          publishBatchSize: 3,
          queue,
          recalculation,
          reconcileBatchSize: 4,
          repository: repository as unknown as PgIngestRepository,
          staleAfterMs: 3_600_000,
        });

      expect(queue.consumeParserResults).toHaveBeenCalledOnce();
      await queue.handlers?.completed(completedMessage);
      await queue.handlers?.failed(failedMessage);
      expect(artifactLoader.loadParserArtifact).toHaveBeenCalledWith(
        completedMessage.artifact,
      );
      expect(repository.recordParserCompleted).toHaveBeenCalledWith({
        ...completedMessage,
        rawSnapshot: parserArtifact,
      });
      expect(recalculation.recalculateParserResult).toHaveBeenCalledWith(
        "parser-result-1",
        parserArtifact,
      );
      expect(repository.recordParserFailed).toHaveBeenCalledWith(failedMessage);

      runtime.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(repository.claimPendingStagingRecords).toHaveBeenCalledWith(2);
      expect(repository.listPublishableJobs).toHaveBeenCalledWith(3);
      expect(repository.reclaimStalePublishedJobs).toHaveBeenCalledWith(
        3_600_000,
        4,
      );

      await runtime.close();
      await vi.advanceTimersByTimeAsync(100);
      expect(repository.claimPendingStagingRecords).toHaveBeenCalledTimes(1);
      expect(repository.listPublishableJobs).toHaveBeenCalledTimes(1);
      expect(repository.reclaimStalePublishedJobs).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips recalculation when parser completion is already terminal", async () => {
    const repository = repositoryDouble();
    repository.recordParserCompleted.mockResolvedValueOnce(null);
    const recalculation = {
        recalculateParserResult: vi.fn(async () => ({
          bountyRows: 0,
          commanderStats: 0,
          normalizedEvents: 0,
          playerStats: 0,
          rotationId: null,
          squadStats: 0,
          status: "recalculated" as const,
        })),
      },
      queue = queueDouble(),
      runtime = await createIngestRuntime({
        artifactLoader: {
          loadParserArtifact: vi.fn(async () => parserArtifact),
        },
        logger: {
          error: vi.fn(),
          info: vi.fn(),
        },
        parserContractVersion: "3.0.0",
        pollIntervalMs: 100,
        promotionBatchSize: 2,
        publishBatchSize: 3,
        queue,
        recalculation,
        reconcileBatchSize: 4,
        repository: repository as unknown as PgIngestRepository,
        staleAfterMs: 3_600_000,
      });

    await queue.handlers?.completed(completedMessage);
    expect(recalculation.recalculateParserResult).not.toHaveBeenCalled();
    await runtime.close();
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

const parserArtifact = {
  contract_version: "3.0.0",
  parser: {},
  players: [],
  source: {},
  status: "success" as const,
};

function repositoryDouble() {
  return {
    claimPendingStagingRecords: vi.fn(async () => []),
    listPublishableJobs: vi.fn(async () => []),
    reclaimStalePublishedJobs: vi.fn(async () => []),
    recordParserCompleted: vi.fn(
      async (): Promise<string | null> => "parser-result-1",
    ),
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
