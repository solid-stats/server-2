/* eslint-disable camelcase */
import { resolveReplayTimestamp } from "./replay-timestamp.js";

import type {
  IngestStagingRecord,
  PromotionOptions,
  PromotionResult,
  ReplayRecord,
} from "./types.js";
import type { PoolClient } from "pg";

export interface PromotionRepository {
  appendReplayEvidence(
    client: PoolClient,
    replay: ReplayRecord,
    record: IngestStagingRecord,
  ): Promise<void>;
  claimPendingStagingRecords(batchSize: number): Promise<IngestStagingRecord[]>;
  createParseJob(
    client: PoolClient,
    replay: ReplayRecord,
    parserContractVersion: string,
  ): Promise<{ id: string }>;
  createReplay(
    client: PoolClient,
    record: IngestStagingRecord,
  ): Promise<ReplayRecord>;
  findReplayByChecksum(
    client: PoolClient,
    checksum: string,
  ): Promise<ReplayRecord | null>;
  findReplayBySource(
    client: PoolClient,
    record: IngestStagingRecord,
  ): Promise<ReplayRecord | null>;
  markStagingConflicted(
    client: PoolClient,
    stagingId: string,
    details: Record<string, unknown>,
  ): Promise<void>;
  markStagingFailed(
    client: PoolClient,
    stagingId: string,
    details: Record<string, unknown>,
  ): Promise<void>;
  markStagingPromoted(
    client: PoolClient,
    stagingId: string,
    evidence: Record<string, unknown>,
  ): Promise<void>;
  withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
}

export class IngestPromotionService {
  public constructor(private readonly repository: PromotionRepository) {}

  public async promotePending(
    options: PromotionOptions,
  ): Promise<PromotionResult[]> {
    const records = await this.repository.claimPendingStagingRecords(
      options.batchSize,
    );
    const results: PromotionResult[] = [];
    for (const record of records) {
      results.push(
        await this.promoteRecord(record, options.parserContractVersion),
      );
    }
    return results;
  }

  private async promoteRecord(
    record: IngestStagingRecord,
    parserContractVersion: string,
  ): Promise<PromotionResult> {
    try {
      return await this.repository.withTransaction((client) =>
        this.promoteRecordInTransaction(client, record, parserContractVersion),
      );
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : "promotion failed",
        stagingId: record.id,
        status: "failed",
      };
    }
  }

  private async promoteRecordInTransaction(
    client: PoolClient,
    record: IngestStagingRecord,
    parserContractVersion: string,
  ): Promise<PromotionResult> {
    const sourceReplay = await this.repository.findReplayBySource(
      client,
      record,
    );
    if (sourceReplay !== null) {
      return this.handleSourceMatch(client, record, sourceReplay);
    }

    const checksumReplay = await this.repository.findReplayByChecksum(
      client,
      record.checksum,
    );
    if (checksumReplay !== null) {
      return this.handleChecksumDuplicate(client, record, checksumReplay);
    }

    const replay = await this.repository.createReplay(
        client,
        withResolvedReplayTimestamp(record),
      ),
      job = await this.repository.createParseJob(
        client,
        replay,
        parserContractVersion,
      );
    await this.repository.markStagingPromoted(client, record.id, {
      parse_job_id: job.id,
      replay_id: replay.id,
    });

    return {
      parseJobId: job.id,
      replayId: replay.id,
      stagingId: record.id,
      status: "promoted",
    };
  }

  private async handleSourceMatch(
    client: PoolClient,
    record: IngestStagingRecord,
    replay: ReplayRecord,
  ): Promise<PromotionResult> {
    if (
      replay.checksum === record.checksum &&
      replay.objectKey === record.objectKey
    ) {
      await this.repository.markStagingPromoted(client, record.id, {
        duplicate_replay_id: replay.id,
      });
      return { replayId: replay.id, stagingId: record.id, status: "duplicate" };
    }

    await this.repository.markStagingConflicted(
      client,
      record.id,
      conflictDetails("source_identity_changed_bytes", record, replay),
    );
    return {
      reason: "source identity already exists with different bytes",
      replayId: replay.id,
      stagingId: record.id,
      status: "conflicted",
    };
  }

  private async handleChecksumDuplicate(
    client: PoolClient,
    record: IngestStagingRecord,
    replay: ReplayRecord,
  ): Promise<PromotionResult> {
    await this.repository.appendReplayEvidence(client, replay, record);
    await this.repository.markStagingPromoted(client, record.id, {
      duplicate_replay_id: replay.id,
    });
    return { replayId: replay.id, stagingId: record.id, status: "duplicate" };
  }
}

function withResolvedReplayTimestamp(
  record: IngestStagingRecord,
): IngestStagingRecord {
  return {
    ...record,
    replayTimestamp: resolveReplayTimestamp(record),
  };
}

function conflictDetails(
  reason: string,
  record: IngestStagingRecord,
  replay: ReplayRecord,
): Record<string, unknown> {
  return {
    existing: {
      checksum: replay.checksum,
      object_key: replay.objectKey,
      replay_id: replay.id,
      size_bytes: replay.sizeBytes,
      source_replay_id: replay.sourceReplayId,
      source_system: replay.sourceSystem,
    },
    reason,
    staging: {
      checksum: record.checksum,
      object_key: record.objectKey,
      size_bytes: record.sizeBytes,
      source_replay_id: record.sourceReplayId,
      source_system: record.sourceSystem,
    },
  };
}
