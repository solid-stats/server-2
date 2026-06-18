/* eslint-disable camelcase, init-declarations, no-magic-numbers, no-inline-comments, unicorn/no-null, @typescript-eslint/no-unnecessary-condition */
//
// pipeline.golden.test.ts — full-chain characterization oracle.
//
// Drives the REAL production path per floor artifact, through the SAME factories
// server.ts wires (never a hand-mirrored copy):
//   promote → durable parse_jobs row → real RabbitMQ publish → real broker delivery
//   → parse.completed consumer → S3 artifact load → recordParserCompleted → recalc
//   → assert the normalized full observable surface incl. GET /stats/* via app.inject.
//
// [tests Integration Harness] real PG+RabbitMQ+S3 via docker-compose, runMigrations(),
// truncate…cascade isolation. [testing-standards §B] no mocked contract boundary —
// a mock here would hide exactly the drift this oracle exists to catch. [conv queue
// reliability] assert the durable parse_jobs row exists BEFORE the publish.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { runMigrations } from "../../infra/db/migrate.js";
import {
  createRabbitMqParserRuntime,
  type RabbitMqParserRuntime,
} from "../../infra/queue/rabbitmq.js";
import { createStorageClient } from "../../infra/storage/client.js";
import { ParseJobPublisher } from "../../modules/ingest/publisher.js";
import { PgIngestRepository } from "../../modules/ingest/repository/repository.js";
import { IngestPromotionService } from "../../modules/ingest/service.js";
import { PgPublicStatsReadModel } from "../../modules/public-stats/repository.js";
import { PgStatisticsRepository } from "../../modules/statistics/repository/repository.js";
import { ParserResultRecalculationService } from "../../modules/statistics/service/recalculation.js";

import {
  TRUNCATE_ALL,
  completedMessage,
  pollUntil,
  publishCompleted,
  purgeParserQueues,
  snapshotSurface,
} from "./fixtures/harness.js";
import {
  archivePresent,
  goldenConfig,
  goldenInfraReachable,
  loadGoldenArtifacts,
  type GoldenArtifact,
} from "./fixtures/loader.js";

import type { FastifyInstance } from "fastify";

const config = goldenConfig(),
  pool = new Pool({ connectionString: config.databaseUrl }),
  runId = Date.now().toString(36),
  // replay_ids whose FULL chain (record + recalc) the consumer has finished.
  completedReplays = new Set<string>(),
  // Load the fixture table SYNCHRONOUSLY at collection time so test.each has a
  // concrete table; runtime infra-absence is handled by it.runIf(infraReachable).
  fixtures: GoldenArtifact[] = archivePresent() ? loadGoldenArtifacts() : [];

let infraReachable = false,
  broker: RabbitMqParserRuntime,
  storage: ReturnType<typeof createStorageClient>,
  s3: S3Client,
  app: FastifyInstance,
  statisticsRepository: PgStatisticsRepository,
  ingestRepository: PgIngestRepository,
  promotionService: IngestPromotionService,
  publisher: ParseJobPublisher;

beforeAll(async () => {
  infraReachable = await goldenInfraReachable(config);
  if (!infraReachable) {
    return;
  }
  await runMigrations(config.databaseUrl);
  await purgeParserQueues(config.rabbitmqUrl);
  ingestRepository = new PgIngestRepository(pool);
  statisticsRepository = new PgStatisticsRepository(pool);
  promotionService = new IngestPromotionService(ingestRepository);
  storage = createStorageClient(config);
  broker = await createRabbitMqParserRuntime(config);
  publisher = new ParseJobPublisher(ingestRepository, broker);
  s3 = new S3Client({
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
    endpoint: config.s3.endpoint,
    forcePathStyle: config.s3.forcePathStyle,
    region: config.s3.region,
  });
  const recalculation = new ParserResultRecalculationService(
    statisticsRepository,
  );
  // Real consumer wired exactly as runtime.ts does it. We additionally record the
  // replay_id once the WHOLE chain (recordParserCompleted + recalc) has finished, so
  // the poll waits for recalc to persist parser_events — not merely for the
  // parser_results row recordParserCompleted writes first (avoids a read race).
  await broker.consumeParserResults({
    completed: async (message) => {
      const artifact = await storage.loadParserArtifact(message.artifact),
        parserResultId = await ingestRepository.recordParserCompleted({
          ...message,
          rawSnapshot: artifact,
        });
      if (parserResultId !== null) {
        await recalculation.recalculateParserResult(parserResultId, artifact);
      }
      completedReplays.add(message.replay_id);
    },
    failed: () => Promise.resolve(),
  });
  app = await buildApp({
    publicStatsReadModel: new PgPublicStatsReadModel(pool),
  });
});

afterAll(async () => {
  await broker?.close();
  await app?.close();
  s3?.destroy();
  await storage?.close();
  await pool.end();
});

beforeEach(async () => {
  if (infraReachable) {
    await pool.query(TRUNCATE_ALL);
  }
});

describe.skipIf(!archivePresent())("golden pipeline oracle", () => {
  it("skips the live chain cleanly when docker-compose is absent", () => {
    // A Docker-less run is a clean pass, not a failure — the real-chain block below
    // is gated on infraReachable so it never runs (and never fails) without infra.
    expect(typeof infraReachable).toBe("boolean");
  });

  it.each(fixtures)(
    "pins the full ingest→stats surface for $name",
    async ({ name, artifact }: GoldenArtifact) => {
      if (!infraReachable) {
        return; // clean skip — docker-compose absent (verify stays green)
      }
      // Stable, name-keyed staging values keep the snapshot deterministic across
      // runs; per-case isolation comes from truncate…cascade + queue purge, not from
      // a per-run id. The runId only namespaces the live S3 object so concurrent runs
      // never collide on the bucket, and it is normalized out of the snapshot.
      const objectKey = `artifacts/v3/${runId}/${name}.json`,
        sourceReplayId = `golden-${name}`,
        checksum = `${"0".repeat(63)}1`;

      // (1) stage + upload artifact bytes to a UNIQUE S3 key (real S3).
      await s3.send(
        new PutObjectCommand({
          Body: JSON.stringify(artifact),
          Bucket: config.s3.bucket,
          Key: objectKey,
        }),
      );
      const staging = await pool.query<{ id: string }>(
        `insert into ingest_staging_records
           (source_system, source_replay_id, object_key, checksum, size_bytes, replay_timestamp, promotion_evidence)
         values ('golden', $1, $2, $3, 123, '2026-05-09T00:00:00.000Z', '{}'::jsonb)
         returning id`,
        [sourceReplayId, objectKey, checksum],
      );
      expect(staging.rows).toHaveLength(1);

      // (2) promote (durable parse_jobs row created in-tx) THEN publish.
      const [promotion] = await promotionService.promotePending({
        batchSize: 1,
        parserContractVersion: "3.0.0",
      });
      expect(promotion).toMatchObject({ status: "promoted" });

      const jobBefore = await pool.query<{
        id: string;
        replay_id: string;
        status: string;
      }>("select id, replay_id, status from parse_jobs");
      // [conv queue reliability] durable job exists BEFORE any parse.requested publish.
      expect(jobBefore.rows).toHaveLength(1);
      expect(jobBefore.rows[0]?.status).toBe("queued");
      const jobId = jobBefore.rows[0]?.id ?? "",
        replayId = jobBefore.rows[0]?.replay_id ?? "";

      const requested = await publisher.publishQueued({ batchSize: 1 });
      expect(requested).toHaveLength(1);
      expect(requested[0]).toMatchObject({
        job_id: jobId,
        parser_contract_version: "3.0.0",
        replay_id: replayId,
      });

      // (3) publish a real parse.completed through the live broker.
      await publishCompleted(
        config.rabbitmqUrl,
        completedMessage({
          bucket: config.s3.bucket,
          checksum,
          jobId,
          objectKey,
          replayId,
        }),
      );

      // (4) bounded-poll to terminal succeeded — the HARD timeout is the only
      // backstop against the consumer's nack-requeue loop (RESEARCH §await-seam).
      await pollUntil(async () => {
        const result = await pool.query<{ status: string }>(
          "select status from parse_jobs where id = $1",
          [jobId],
        );
        return (
          result.rows[0]?.status === "succeeded" &&
          completedReplays.has(replayId)
        );
      });

      // (5) assert the normalized full observable surface as a file snapshot.
      const surface = await snapshotSurface(pool, app);
      await expect(JSON.stringify(surface, null, 2)).toMatchFileSnapshot(
        `./__snapshots__/pipeline-${name}.snap.json`,
      );
    },
    // Per-test ceiling above the 30s bounded poll so a live-broker round-trip does
    // not false-fail on the default 5s vitest timeout.
    40_000,
  );
});
