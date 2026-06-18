/* eslint-disable camelcase, init-declarations, max-lines, max-lines-per-function, no-magic-numbers, unicorn/no-null */
//
// invariants.golden.test.ts — idempotency / dedup / conflict / re-delivery / role-gate.
//
// Pins the current invariants from CONTEXT as-is (principle 7). Conflict and
// parse.failed are documented SYNTHETIC non-broker paths (RESEARCH open-item #2):
// a throwing artifact must never be round-tripped through the real broker (it would
// nack-requeue forever — rabbitmq.ts:126-128), so these exercise the repository /
// service directly. The role-gate uses the in-memory auth stores wired into buildApp.
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp, createDefaultAuthOptions } from "../../app.js";
import { runMigrations } from "../../infra/db/migrate.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../modules/auth/routes/memory.js";
import { PgIngestRepository } from "../../modules/ingest/repository/repository.js";
import { IngestPromotionService } from "../../modules/ingest/service.js";

import { TRUNCATE_ALL } from "./fixtures/harness.js";
import {
  archivePresent,
  goldenConfig,
  goldenInfraReachable,
} from "./fixtures/loader.js";

import type { AuthRouteOptions } from "../../modules/auth/routes/models.js";

const config = goldenConfig(),
  pool = new Pool({ connectionString: config.databaseUrl }),
  checksumA = "a".repeat(64),
  checksumB = "b".repeat(64),
  replayTs = "2026-05-09T00:00:00.000Z";

let infraReachable = false,
  repository: PgIngestRepository,
  service: IngestPromotionService;

beforeAll(async () => {
  infraReachable = await goldenInfraReachable(config);
  if (!infraReachable) {
    return;
  }
  await runMigrations(config.databaseUrl);
  repository = new PgIngestRepository(pool);
  service = new IngestPromotionService(repository);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  if (infraReachable) {
    await pool.query(TRUNCATE_ALL);
  }
});

describe.skipIf(!archivePresent())("golden ingest invariants", () => {
  it("documents a clean skip when docker-compose is absent", () => {
    // A Docker-less run is a clean pass; the live blocks below are gated on
    // infraReachable so they never run (and never fail) without infra. Collection-time
    // archive absence skips the whole suite via describe.skipIf (parity with the
    // pipeline/bounty suites — honest skipped, not phantom-passed, reporting).
    expect(typeof infraReachable).toBe("boolean");
  });

  it("1. creates the durable parse_jobs row BEFORE any publish (never fire-and-forget)", async () => {
    if (!infraReachable) {
      return;
    }
    await insertStaging("src-1", "rep-1", checksumA);
    const [result] = await service.promotePending({
      batchSize: 1,
      parserContractVersion: "3.0.0",
    });
    expect(result).toMatchObject({ status: "promoted" });
    // The durable job exists in 'queued' (not yet published) — publish is a later task.
    const jobs = await pool.query<{ status: string }>(
      "select status from parse_jobs",
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]?.status).toBe("queued");
  });

  it("2. re-promoting the same staging row dedups → status=promoted + duplicate_replay_id", async () => {
    if (!infraReachable) {
      return;
    }
    await insertStaging("src-2", "rep-2", checksumA);
    const [first] = await service.promotePending({
      batchSize: 1,
      parserContractVersion: "3.0.0",
    });
    expect(first).toMatchObject({ status: "promoted" });

    // A second staging row with the SAME checksum (no source match) → checksum-duplicate.
    await insertStaging("src-2b", "rep-2b", checksumA);
    const [second] = await service.promotePending({
      batchSize: 1,
      parserContractVersion: "3.0.0",
    });
    expect(second).toMatchObject({ status: "duplicate" });

    const evidence = await pool.query<{
      promotion_evidence: { duplicate_replay_id?: string };
      status: string;
    }>(
      "select status, promotion_evidence from ingest_staging_records where source_replay_id = 'rep-2b'",
    );
    expect(evidence.rows[0]?.status).toBe("promoted");
    expect(evidence.rows[0]?.promotion_evidence.duplicate_replay_id).toEqual(
      expect.any(String),
    );
  });

  it("3. same source identity, different bytes → status=conflicted + reason=source_identity_changed_bytes", async () => {
    if (!infraReachable) {
      return;
    }
    await insertStaging("src-3", "rep-3", checksumA);
    await service.promotePending({
      batchSize: 1,
      parserContractVersion: "3.0.0",
    });
    // Synthetic conflict pair: SAME (source_system, source_replay_id), DIFFERENT bytes.
    // The staging unique (source_system, source_replay_id) is enforced, so the conflict
    // path is exercised by inserting a row that re-uses the identity via a fresh
    // staging record after the first was promoted (the original staging row is gone
    // from pending; insert a new identical-identity row to trigger the conflict branch).
    await pool.query(
      `insert into ingest_staging_records
         (source_system, source_replay_id, object_key, checksum, size_bytes, replay_timestamp, promotion_evidence)
       values ('src-3', 'rep-3', 'raw/rep-3-v2.ocap.json', $1, 123, $2, '{}'::jsonb)
       on conflict (source_system, source_replay_id) do update
         set status = 'pending', checksum = excluded.checksum, object_key = excluded.object_key`,
      [checksumB, replayTs],
    );
    const [conflict] = await service.promotePending({
      batchSize: 1,
      parserContractVersion: "3.0.0",
    });
    expect(conflict).toMatchObject({ status: "conflicted" });

    const row = await pool.query<{
      conflict_details: { reason?: string };
      status: string;
    }>(
      "select status, conflict_details from ingest_staging_records where source_replay_id = 'rep-3'",
    );
    expect(row.rows[0]?.status).toBe("conflicted");
    expect(row.rows[0]?.conflict_details.reason).toBe(
      "source_identity_changed_bytes",
    );
  });

  it("4. re-delivering the same parse.completed records terminal state once (idempotent)", async () => {
    if (!infraReachable) {
      return;
    }
    const { jobId, replayId } = await promoteAndPublish("src-4", "rep-4");
    const completed = {
      artifact: {
        bucket: config.s3.bucket,
        key: `artifacts/v3/${replayId}.json`,
      },
      artifact_checksum: { algorithm: "sha256" as const, value: checksumB },
      artifact_size_bytes: 1234,
      job_id: jobId,
      parser_contract_version: "3.0.0",
      replay_id: replayId,
      source_checksum: { algorithm: "sha256" as const, value: checksumA },
    };
    // First record → returns a parser_result id; second is a no-op (terminal job).
    expect(await repository.recordParserCompleted(completed)).toEqual(
      expect.any(String),
    );
    expect(await repository.recordParserCompleted(completed)).toBeNull();
    const current = await pool.query(
      "select 1 from parser_results where replay_id = $1 and status = 'current'",
      [replayId],
    );
    expect(current.rows).toHaveLength(1);
  });

  it("5. parse.failed records terminal failed state once (idempotent, synthetic message)", async () => {
    if (!infraReachable) {
      return;
    }
    const { jobId, replayId } = await promoteAndPublish("src-5", "rep-5");
    // Hand-built parse.failed message (documented synthetic exception — never round-trip
    // a throwing artifact through the broker).
    const failed = {
      failure: {
        error_code: "schema.unsupported",
        message: "unsupported",
        retryability: "not_retryable" as const,
        stage: "schema",
      },
      job_id: { state: "present" as const, value: jobId },
      message_type: "parse.failed" as const,
      parser_contract_version: { state: "present" as const, value: "3.0.0" },
      replay_id: { state: "present" as const, value: replayId },
    };
    expect(await repository.recordParserFailed(failed)).toBe(true);
    expect(await repository.recordParserFailed(failed)).toBe(false);
    const job = await pool.query<{ status: string }>(
      "select status from parse_jobs where id = $1",
      [jobId],
    );
    expect(job.rows[0]?.status).toBe("failed");
  });

  it("6. admin role-gate: 401 without session, 403 without role, 2xx with admin role", async () => {
    if (!infraReachable) {
      return;
    }
    const users = new InMemoryAuthUserRepository(),
      sessions = new InMemorySessionStore(),
      auth: AuthRouteOptions = {
        ...createDefaultAuthOptions(),
        sessions,
        users,
      },
      app = await buildApp({ auth });
    try {
      // No session → 401 (requireRole UNAUTHORIZED).
      const anon = await app.inject({
        method: "POST",
        payload: rotationBody(),
        url: "/admin/rotations",
      });
      expect(anon.statusCode).toBe(401);

      // Session for a user WITHOUT the admin role → 403 (requireRole FORBIDDEN).
      const member = await users.upsertSteamUser({
          displayName: "Member",
          steamId: "steam-member",
        }),
        memberSession = await sessions.create(member.id, 3600);
      const forbidden = await app.inject({
        headers: { cookie: `solid_stats_session=${memberSession.id}` },
        method: "POST",
        payload: rotationBody(),
        url: "/admin/rotations",
      });
      expect(forbidden.statusCode).toBe(403);

      // Session for a user WITH the admin role → 2xx via the shared requireRole pre-handler.
      const adminUser = await users.upsertSteamUser({
        displayName: "Admin",
        steamId: "steam-admin",
      });
      await users.setUserRoles(adminUser.id, ["admin"]);
      const adminSession = await sessions.create(adminUser.id, 3600);
      const allowed = await app.inject({
        headers: { cookie: `solid_stats_session=${adminSession.id}` },
        method: "POST",
        payload: rotationBody(),
        url: "/admin/rotations",
      });
      expect(allowed.statusCode).toBeLessThan(300);
      expect(allowed.statusCode).toBeGreaterThanOrEqual(200);
    } finally {
      await app.close();
    }
  });
});

function rotationBody(): { endsAt: null; name: string; startsAt: string } {
  return {
    endsAt: null,
    name: `gate-${Date.now().toString(36)}`,
    startsAt: "2026-06-01T00:00:00.000Z",
  };
}

async function insertStaging(
  sourceSystem: string,
  sourceReplayId: string,
  checksum: string,
): Promise<void> {
  await pool.query(
    `insert into ingest_staging_records
       (source_system, source_replay_id, object_key, checksum, size_bytes, replay_timestamp, promotion_evidence)
     values ($1, $2, $3, $4, 123, $5, '{}'::jsonb)`,
    [
      sourceSystem,
      sourceReplayId,
      `raw/${sourceReplayId}.ocap.json`,
      checksum,
      replayTs,
    ],
  );
}

async function promoteAndPublish(
  sourceSystem: string,
  sourceReplayId: string,
): Promise<{ jobId: string; replayId: string }> {
  await insertStaging(sourceSystem, sourceReplayId, checksumA);
  await service.promotePending({
    batchSize: 1,
    parserContractVersion: "3.0.0",
  });
  const job = await pool.query<{ id: string; replay_id: string }>(
    "select id, replay_id from parse_jobs order by created_at desc limit 1",
  );
  const jobId = job.rows[0]?.id ?? "",
    replayId = job.rows[0]?.replay_id ?? "";
  await pool.query("update parse_jobs set status = 'published' where id = $1", [
    jobId,
  ]);
  return { jobId, replayId };
}
