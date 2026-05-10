/* eslint-disable camelcase, max-lines, max-lines-per-function, max-params, max-statements, no-magic-numbers, unicorn/no-null */
import { Pool, type PoolClient } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../../config/env.js";
import { runMigrations } from "../../../../infra/db/migrate.js";
import { PgIngestRepository } from "../repository.js";

import type { IngestStagingRecord } from "../../types.js";

const env = {
    DATABASE_URL:
      process.env["DATABASE_URL"] ??
      "postgresql://solid:solid@localhost:15432/solid_stats",
    RABBITMQ_URL:
      process.env["RABBITMQ_URL"] ?? "amqp://solid:solid@localhost:5673",
    S3_ACCESS_KEY_ID: process.env["S3_ACCESS_KEY_ID"] ?? "solid",
    S3_BUCKET: process.env["S3_BUCKET"] ?? "solid-replays",
    S3_ENDPOINT: process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
    S3_FORCE_PATH_STYLE: process.env["S3_FORCE_PATH_STYLE"] ?? "true",
    S3_REGION: process.env["S3_REGION"] ?? "us-east-1",
    S3_SECRET_ACCESS_KEY: process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
  },
  config = loadConfig(env),
  pool = new Pool({ connectionString: config.databaseUrl }),
  repository = new PgIngestRepository(pool),
  checksumA = "a".repeat(64),
  checksumB = "b".repeat(64),
  checksumC = "c".repeat(64),
  replayTimestamp = "2026-05-09T00:00:00.000Z";

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(
    "truncate parser_results, parse_jobs, replays, ingest_staging_records cascade",
  );
});

describe("PgIngestRepository", () => {
  it("claims pending staging rows, promotes replay state, and lists lifecycle records", async () => {
    const staging = await insertStaging("source-a", "replay-a", checksumA),
      [claimedResult] = await repository.claimPendingStagingRecords(5),
      claimed = requiredRecord(claimedResult);

    expect(claimed).toMatchObject({
      checksum: checksumA,
      id: staging.id,
      replayTimestamp,
      status: "processing",
    });

    await repository.withTransaction(async (client) => {
      const missingBySource = await repository.findReplayBySource(
          client,
          claimed,
        ),
        missingByChecksum = await repository.findReplayByChecksum(
          client,
          checksumA,
        ),
        replay = await repository.createReplay(client, claimed),
        foundBySource = await repository.findReplayBySource(client, claimed),
        foundByChecksum = await repository.findReplayByChecksum(
          client,
          checksumA,
        ),
        job = await repository.createParseJob(client, replay, "3.0.0");

      expect(missingBySource).toBeNull();
      expect(missingByChecksum).toBeNull();
      expect(foundBySource).toMatchObject({ id: replay.id });
      expect(foundByChecksum).toMatchObject({ id: replay.id });
      expect(job).toMatchObject({
        attempts: 0,
        replayId: replay.id,
        status: "queued",
      });
      await repository.appendReplayEvidence(client, replay, claimed);
      await repository.markStagingPromoted(client, claimed.id, {
        parse_job_id: job.id,
      });
    });

    const stagingPage = await repository.listStagingRecords(
        {
          checksum: checksumA,
          sourceReplayId: "replay-a",
          sourceSystem: "source-a",
          status: "promoted",
        },
        { page: 1, pageSize: 10 },
      ),
      [jobResult] = await repository.listPublishableJobs(10),
      job = requiredRecord(jobResult),
      jobPage = await repository.listParseJobs(
        {
          checksum: checksumA,
          jobId: job.id,
          replayId: job.replayId,
          status: "queued",
        },
        { page: 1, pageSize: 10 },
      );

    expect(stagingPage).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(await repository.getStagingRecord(staging.id)).toMatchObject({
      status: "promoted",
    });
    expect(
      await repository.getStagingRecord("00000000-0000-4000-8000-000000000999"),
    ).toBeNull();
    expect(jobPage.items).toHaveLength(1);
    expect(await repository.getParseJob(job.id)).toMatchObject({
      status: "queued",
    });
    expect(await repository.getParseJob(staging.id)).toBeNull();
  });

  it("maps nullable timestamps and empty pages from repository rows", async () => {
    const staging = await insertStagingWithTimestamp(
        "source-null",
        "replay-null",
        "9".repeat(64),
        null,
      ),
      [claimedResult] = await repository.claimPendingStagingRecords(1),
      claimed = requiredRecord(claimedResult);

    expect(claimed.replayTimestamp).toBeNull();
    await repository.withTransaction(async (client) => {
      const replay = await repository.createReplay(client, claimed),
        job = await repository.createParseJob(client, replay, "3.0.0");

      expect(replay.replayTimestamp).toBeNull();
      expect(job.error).toBeNull();
      expect(job.finishedAt).toBeNull();
      expect(job.publishedAt).toBeNull();
      expect(job.startedAt).toBeNull();
    });

    const emptyStagingPage = await repository.listStagingRecords(
        { sourceSystem: "missing" },
        { page: 2, pageSize: 5 },
      ),
      emptyJobPage = await repository.listParseJobs(
        { status: "failed" },
        { page: 2, pageSize: 5 },
      );

    expect(emptyStagingPage).toMatchObject({ items: [], page: 2, total: 0 });
    expect(emptyJobPage).toMatchObject({ items: [], page: 2, total: 0 });
    expect(await repository.getStagingRecord(staging.id)).toMatchObject({
      replayTimestamp: null,
    });
  });

  it("records conflict, failed staging, publish transitions, and parser terminal results", async () => {
    const conflict = await insertStaging("source-b", "replay-b", checksumB),
      failed = await insertStaging("source-c", "replay-c", checksumC),
      claimed = await repository.claimPendingStagingRecords(5),
      lifecycleIds: {
        failedJobId?: string;
        failedReplayId?: string;
        jobId?: string;
        replayId?: string;
        retryJobId?: string;
        retryReplayId?: string;
      } = {};

    await repository.withTransaction(async (client) => {
      await repository.markStagingConflicted(client, conflict.id, {
        reason: "source_identity_changed_bytes",
      });
      await repository.markStagingFailed(client, failed.id, {
        reason: "temporary_failure",
      });
    });

    const conflictPage = await repository.listStagingRecords(
      {},
      { page: 1, pageSize: 20 },
    );
    expect(conflictPage.total).toBe(2);

    const promoted = requiredRecord(
      claimed.find((record) => record.id === conflict.id),
    );
    await repository.withTransaction(async (client) => {
      const replay = await repository.createReplay(client, promoted),
        job = await repository.createParseJob(client, replay, "3.0.0");
      await repository.markStagingPromoted(
        client,
        replay.promotedFromStagingId ?? "",
        {},
      );

      const retryReplay = await repository.createReplay(
          client,
          await insertStagingOutsideTransaction(
            "source-d",
            "replay-d",
            "d".repeat(64),
          ),
        ),
        retryJob = await repository.createParseJob(
          client,
          retryReplay,
          "3.0.0",
        ),
        failedReplay = await repository.createReplay(
          client,
          await insertStagingOutsideTransaction(
            "source-e",
            "replay-e",
            "e".repeat(64),
          ),
        ),
        failedJob = await repository.createParseJob(
          client,
          failedReplay,
          "3.0.0",
        );

      Object.assign(lifecycleIds, {
        failedJobId: failedJob.id,
        failedReplayId: failedReplay.id,
        jobId: job.id,
        replayId: replay.id,
        retryJobId: retryJob.id,
        retryReplayId: retryReplay.id,
      });
    });

    await repository.markJobPublished(required(lifecycleIds.jobId));
    expect(
      await repository.recordParserCompleted(
        completedMessage(
          required(lifecycleIds.jobId),
          required(lifecycleIds.replayId),
        ),
      ),
    ).toEqual(expect.any(String));
    expect(
      await repository.recordParserCompleted(
        completedMessage(
          required(lifecycleIds.jobId),
          required(lifecycleIds.replayId),
        ),
      ),
    ).toBeNull();
    await repository.markJobPublishFailed(required(lifecycleIds.retryJobId), {
      message: "broker down",
    });
    expect(
      await repository.recordParserFailed(
        failedMessage(
          required(lifecycleIds.retryJobId),
          required(lifecycleIds.retryReplayId),
          true,
        ),
      ),
    ).toBe(true);
    expect(
      await repository.recordParserFailed(
        failedMessage(
          required(lifecycleIds.failedJobId),
          required(lifecycleIds.failedReplayId),
          false,
        ),
      ),
    ).toBe(true);
    expect(
      await repository.recordParserFailed(
        failedMessage(
          required(lifecycleIds.failedJobId),
          required(lifecycleIds.failedReplayId),
          false,
        ),
      ),
    ).toBe(false);

    const published = await repository.listParseJobs(
        { status: "succeeded" },
        { page: 1, pageSize: 10 },
      ),
      failedJobs = await repository.listParseJobs(
        { status: "failed" },
        { page: 1, pageSize: 10 },
      );

    expect(published.total).toBe(1);
    expect(failedJobs.total).toBe(1);
    expect(
      await repository.recordParserFailed(
        failedMessage(conflict.id, conflict.id, false),
      ),
    ).toBe(false);

    const completedHistory = await repository.listParseJobHistory(
        required(lifecycleIds.jobId),
      ),
      retryHistory = await repository.listParseJobHistory(
        required(lifecycleIds.retryJobId),
      );
    expect(completedHistory.map((entry) => entry.action)).toEqual([
      "created",
      "published",
      "parser_completed",
    ]);
    expect(retryHistory.map((entry) => entry.action)).toEqual([
      "created",
      "publish_failed",
      "parser_failed",
    ]);

    const operatorId = "00000000-0000-4000-8000-000000000701",
      retryResult = await repository.retryParseJob(
        required(lifecycleIds.retryJobId),
        operatorId,
        { reason: "operator retry" },
      );

    expect(retryResult).toMatchObject({
      job: { error: null, status: "queued" },
      kind: "retried",
    });
    await expect(
      repository.retryParseJob(required(lifecycleIds.jobId), operatorId, {}),
    ).resolves.toMatchObject({
      kind: "conflict",
    });
    await expect(
      repository.retryParseJob(conflict.id, operatorId, {}),
    ).resolves.toEqual({ kind: "not_found" });

    const manualReparse = await repository.createManualReparse(
      required(lifecycleIds.replayId),
      "3.0.1",
      operatorId,
      { reason: "parser fix" },
    );

    expect(manualReparse).toMatchObject({
      job: {
        parserContractVersion: "3.0.1",
        replayId: required(lifecycleIds.replayId),
        status: "queued",
      },
      kind: "created",
    });
    await expect(
      repository.createManualReparse(conflict.id, "3.0.1", operatorId, {}),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      repository.markJobPublished(conflict.id),
    ).resolves.toBeUndefined();
    await expect(
      repository.markJobPublishFailed(conflict.id, { message: "missing" }),
    ).resolves.toBeUndefined();

    const manualHistory =
      manualReparse.kind === "created"
        ? await repository.listParseJobHistory(manualReparse.job.id)
        : [];
    expect(manualHistory).toMatchObject([
      {
        action: "manual_reparse",
        actorUserId: operatorId,
        statusFrom: null,
        statusTo: "queued",
      },
    ]);
  });

  it("rolls back transactions and reports missing insert rows defensively", async () => {
    await expect(
      repository.withTransaction(async () => {
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");

    await expect(
      repository.createReplay(
        fakeEmptyClient(),
        await insertStaging("source-z", "replay-z", "f".repeat(64)),
      ),
    ).rejects.toThrow("expected query to return a row");
  });
});

async function insertStaging(
  sourceSystem: string,
  sourceReplayId: string,
  checksum: string,
): Promise<IngestStagingRecord> {
  return insertStagingWithTimestamp(
    sourceSystem,
    sourceReplayId,
    checksum,
    replayTimestamp,
  );
}

async function insertStagingWithTimestamp(
  sourceSystem: string,
  sourceReplayId: string,
  checksum: string,
  timestamp: string | null,
): Promise<IngestStagingRecord> {
  const result = await pool.query<{ id: string }>(
    `
      insert into ingest_staging_records (
        source_system, source_replay_id, object_key, checksum, size_bytes,
        replay_timestamp, promotion_evidence
      )
      values ($1, $2, $3, $4, 123, $5, '{"source_url":"https://example.test"}')
      returning id
    `,
    [
      sourceSystem,
      sourceReplayId,
      `raw/${sourceReplayId}.ocap.json`,
      checksum,
      timestamp,
    ],
  );
  const record = await repository.getStagingRecord(result.rows[0]?.id ?? "");
  if (record === null) {
    throw new Error("staging insert failed");
  }
  return record;
}

async function insertStagingOutsideTransaction(
  sourceSystem: string,
  sourceReplayId: string,
  checksum: string,
): Promise<IngestStagingRecord> {
  return insertStaging(sourceSystem, sourceReplayId, checksum);
}

function completedMessage(jobId: string, replayId: string) {
  return {
    artifact: {
      bucket: "solid-replays",
      key: `artifacts/v3/${replayId}/${checksumA}.json`,
    },
    artifact_checksum: {
      algorithm: "sha256" as const,
      value: checksumB,
    },
    artifact_size_bytes: 1234,
    job_id: jobId,
    message_type: "parse.completed" as const,
    parser: {
      name: "replay-parser-2",
      version: "0.1.0",
    },
    parser_contract_version: "3.0.0",
    replay_id: replayId,
    source_checksum: {
      algorithm: "sha256" as const,
      value: checksumA,
    },
  };
}

function failedMessage(jobId: string, replayId: string, retryable: boolean) {
  return {
    failure: {
      error_code: retryable ? "io.timeout" : "schema.unsupported",
      message: retryable ? "timeout" : "unsupported",
      retryability: retryable
        ? ("retryable" as const)
        : ("not_retryable" as const),
      stage: retryable ? "io" : "schema",
    },
    job_id: { state: "present" as const, value: jobId },
    message_type: "parse.failed" as const,
    parser_contract_version: { state: "present" as const, value: "3.0.0" },
    replay_id: { state: "present" as const, value: replayId },
  };
}

function fakeEmptyClient(): PoolClient {
  return {
    query: () => Promise.resolve({ rows: [] }),
  } as unknown as PoolClient;
}

function required(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("expected id");
  }
  return value;
}

function requiredRecord<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected record");
  }
  return value;
}
