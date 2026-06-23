/* eslint-disable @typescript-eslint/prefer-promise-reject-errors, camelcase, class-methods-use-this, max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { IngestPromotionService, type PromotionRepository } from "./service.js";

import type { IngestStagingRecord, ReplayRecord } from "./types.js";
import type { PoolClient } from "pg";

const stagingRecord: IngestStagingRecord = {
  checksum: "0".repeat(64),
  conflictDetails: {},
  createdAt: "2026-05-09T00:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  objectKey: "raw/replay-1.ocap.json",
  promotionEvidence: { source_url: "https://example.test/replay-1" },
  replayTimestamp: "2026-05-09T00:00:00.000Z",
  sizeBytes: 123,
  sourceReplayId: "replay-1",
  sourceSystem: "solidgames",
  status: "processing",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

const replayRecord: ReplayRecord = {
  checksum: stagingRecord.checksum,
  createdAt: "2026-05-09T00:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000101",
  objectKey: stagingRecord.objectKey,
  promotedFromStagingId: stagingRecord.id,
  promotionEvidence: {},
  replayTimestamp: stagingRecord.replayTimestamp,
  sizeBytes: stagingRecord.sizeBytes,
  sourceReplayId: stagingRecord.sourceReplayId,
  sourceSystem: stagingRecord.sourceSystem,
  status: "ready_for_parse",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

describe("IngestPromotionService", () => {
  it("promotes a new staging record into replay and queued parse job state", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];

    const service = new IngestPromotionService(repository),
      results = await service.promotePending({
        batchSize: 10,
        parserContractVersion: "3.0.0",
      });

    expect(results).toEqual([
      {
        parseJobId: "00000000-0000-4000-8000-000000000201",
        replayId: replayRecord.id,
        stagingId: stagingRecord.id,
        status: "promoted",
      },
    ]);
    expect(repository.createdParseJobFor).toBe(replayRecord.id);
    expect(repository.promotedEvidence).toMatchObject({
      parse_job_id: "00000000-0000-4000-8000-000000000201",
      replay_id: replayRecord.id,
    });
  });

  it("derives replay_timestamp from source_replay_id when the staging timestamp is null", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [
      {
        ...stagingRecord,
        replayTimestamp: null,
        sourceReplayId: "sg-zone-1624129684",
      },
    ];

    const service = new IngestPromotionService(repository);
    await service.promotePending({
      batchSize: 10,
      parserContractVersion: "3.0.0",
    });

    expect(repository.createReplayRecord?.replayTimestamp).toBe(
      "2021-06-19T19:08:04.000Z",
    );
  });

  it("overrides a present staging timestamp with the in-range source_replay_id epoch", async () => {
    // Epoch-primary at the service boundary: even though the staged record carries a present
    // replayTimestamp (2026-05-09), the in-range epoch in source_replay_id wins at promotion.
    const repository = new FakePromotionRepository();
    repository.claimed = [
      { ...stagingRecord, sourceReplayId: "sg-zone-1624129684" },
    ];

    const service = new IngestPromotionService(repository);
    await service.promotePending({
      batchSize: 10,
      parserContractVersion: "3.0.0",
    });

    expect(repository.createReplayRecord?.replayTimestamp).toBe(
      "2021-06-19T19:08:04.000Z",
    );
  });

  it("marks source identity byte changes as conflicts", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];
    repository.sourceReplay = {
      ...replayRecord,
      checksum: "1".repeat(64),
      objectKey: "raw/changed.ocap.json",
    };

    const service = new IngestPromotionService(repository),
      [result] = await service.promotePending({
        batchSize: 10,
        parserContractVersion: "3.0.0",
      });

    expect(result).toMatchObject({
      replayId: replayRecord.id,
      stagingId: stagingRecord.id,
      status: "conflicted",
    });
    expect(repository.conflictDetails).toMatchObject({
      reason: "source_identity_changed_bytes",
    });
    expect(repository.createdParseJobFor).toBeUndefined();
  });

  it("attaches duplicate checksum evidence without creating another parse job", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];
    repository.checksumReplay = {
      ...replayRecord,
      sourceReplayId: "different-source-id",
    };

    const service = new IngestPromotionService(repository),
      [result] = await service.promotePending({
        batchSize: 10,
        parserContractVersion: "3.0.0",
      });

    expect(result).toMatchObject({
      replayId: replayRecord.id,
      stagingId: stagingRecord.id,
      status: "duplicate",
    });
    expect(repository.appendedReplayEvidence).toBe(replayRecord.id);
    expect(repository.createdParseJobFor).toBeUndefined();
  });

  it("marks exact source matches as duplicates", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];
    repository.sourceReplay = replayRecord;

    const service = new IngestPromotionService(repository),
      [result] = await service.promotePending({
        batchSize: 10,
        parserContractVersion: "3.0.0",
      });

    expect(result).toMatchObject({
      replayId: replayRecord.id,
      stagingId: stagingRecord.id,
      status: "duplicate",
    });
    expect(repository.promotedEvidence).toMatchObject({
      duplicate_replay_id: replayRecord.id,
    });
  });

  it("returns failed promotion results when the transaction throws", async () => {
    const repository = new FakePromotionRepository();
    repository.claimed = [stagingRecord];
    repository.transactionError = new Error("database unavailable");

    const service = new IngestPromotionService(repository),
      [result] = await service.promotePending({
        batchSize: 10,
        parserContractVersion: "3.0.0",
      });

    expect(result).toEqual({
      reason: "database unavailable",
      stagingId: stagingRecord.id,
      status: "failed",
    });

    repository.transactionError = "broken";
    const [unknownError] = await service.promotePending({
      batchSize: 10,
      parserContractVersion: "3.0.0",
    });
    expect(unknownError).toMatchObject({
      reason: "promotion failed",
      status: "failed",
    });
  });
});

class FakePromotionRepository implements PromotionRepository {
  public appendedReplayEvidence: string | undefined;
  public checksumReplay: ReplayRecord | null = null;
  public claimed: IngestStagingRecord[] = [];
  public conflictDetails: Record<string, unknown> | undefined;
  public createdParseJobFor: string | undefined;
  public createReplayRecord: IngestStagingRecord | undefined;
  public promotedEvidence: Record<string, unknown> | undefined;
  public sourceReplay: ReplayRecord | null = null;
  public transactionError: unknown;

  public appendReplayEvidence(
    _client: PoolClient,
    replay: ReplayRecord,
  ): Promise<void> {
    this.appendedReplayEvidence = replay.id;
    return Promise.resolve();
  }

  public claimPendingStagingRecords(): Promise<IngestStagingRecord[]> {
    return Promise.resolve(this.claimed);
  }

  public createParseJob(
    _client: PoolClient,
    replay: ReplayRecord,
  ): Promise<{ id: string }> {
    this.createdParseJobFor = replay.id;
    return Promise.resolve({ id: "00000000-0000-4000-8000-000000000201" });
  }

  public createReplay(
    _client: PoolClient,
    record: IngestStagingRecord,
  ): Promise<ReplayRecord> {
    this.createReplayRecord = record;
    return Promise.resolve(replayRecord);
  }

  public findReplayByChecksum(): Promise<ReplayRecord | null> {
    return Promise.resolve(this.checksumReplay);
  }

  public findReplayBySource(): Promise<ReplayRecord | null> {
    return Promise.resolve(this.sourceReplay);
  }

  public markStagingConflicted(
    _client: PoolClient,
    _stagingId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.conflictDetails = details;
    return Promise.resolve();
  }

  public markStagingFailed(): Promise<void> {
    return Promise.resolve();
  }

  public markStagingPromoted(
    _client: PoolClient,
    _stagingId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    this.promotedEvidence = evidence;
    return Promise.resolve();
  }

  public withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (this.transactionError !== undefined) {
      return Promise.reject(this.transactionError);
    }
    return callback({} as PoolClient);
  }
}
