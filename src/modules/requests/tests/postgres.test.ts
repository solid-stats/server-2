/* eslint-disable max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { runMigrations } from "../../../infra/db/migrate.js";
import { PgAuthUserRepository } from "../../auth/routes/postgres.js";
import {
  PgPlayerRequestRepository,
  PgReferenceValidator,
} from "../routes/postgres.js";

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
  repository = new PgPlayerRequestRepository(pool),
  references = new PgReferenceValidator(pool);

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate request_workflow_actions, audit_patches, moderation_actions,
      request_attachments, requests, auth_sessions, user_roles, roles, users,
      player_stats, replays, ingest_staging_records, canonical_players,
      squads, rotations cascade
  `);
  await seedReferences();
});

afterAll(async () => {
  await pool.end();
});

describe("PgPlayerRequestRepository", () => {
  it("persists requester-scoped requests and attachments", async () => {
    const requester = await createUser("steam-requester", "Requester"),
      otherUser = await createUser("steam-other", "Other"),
      request = await repository.create({
        description: "Fix my stats",
        reference: { id: playerId, type: "player" },
        requesterUserId: requester.id,
        type: "stats_correction",
      }),
      unreferenced = await repository.create({
        description: "Link Steam",
        requesterUserId: requester.id,
        type: "steam_link",
      });

    expect(request.reference).toEqual({ id: playerId, type: "player" });
    expect(unreferenced.reference).toBeNull();
    await expect(
      new PgPlayerRequestRepository(pool).findForRequester(
        request.id,
        requester.id,
      ),
    ).resolves.toMatchObject({ description: "Fix my stats" });
    await expect(
      repository.findForRequester(request.id, otherUser.id),
    ).resolves.toBeNull();
    await expect(
      repository.listForRequester(requester.id),
    ).resolves.toHaveLength(2);

    await repository.create({
      checksum: "abc",
      contentType: "text/plain",
      fileName: "proof.txt",
      objectKey: "attachments/proof.txt",
      requestId: request.id,
      sizeBytes: 12,
    });
    await repository.create({
      contentType: "image/png",
      fileName: "proof.png",
      objectKey: "attachments/proof.png",
      requestId: request.id,
      sizeBytes: 21,
    });
    await expect(repository.listForRequest(request.id)).resolves.toMatchObject([
      { checksum: "abc", fileName: "proof.txt", sizeBytes: 12 },
      { checksum: null, fileName: "proof.png", sizeBytes: 21 },
    ]);
  });

  it("persists moderation decisions, audit patches, and workflow actions", async () => {
    const requester = await createUser("steam-requester", "Requester"),
      moderator = await createUser("steam-moderator", "Moderator"),
      statsRequest = await repository.create({
        description: "Patch stats",
        reference: { id: statId, type: "stat" },
        requesterUserId: requester.id,
        type: "stats_correction",
      }),
      workflowRequest = await repository.create({
        description: "Merge players",
        requesterUserId: requester.id,
        type: "merge_split",
      });

    await expect(
      repository.decide({
        action: "reject",
        comment: "missing evidence",
        moderatorUserId: moderator.id,
        requestId: "00000000-0000-4000-8000-000000009404",
      }),
    ).resolves.toBeNull();

    await expect(
      repository.decide({
        action: "approve",
        comment: "looks good",
        moderatorUserId: moderator.id,
        requestId: statsRequest.id,
      }),
    ).resolves.toMatchObject({
      action: { action: "approve", comment: "looks good" },
      request: { status: "approved" },
    });
    await repository.decide({
      action: "reject",
      comment: "not this one",
      moderatorUserId: moderator.id,
      requestId: workflowRequest.id,
    });
    await repository.decide({
      action: "approve",
      comment: "approved after review",
      moderatorUserId: moderator.id,
      requestId: workflowRequest.id,
    });

    await expect(repository.listForModeration()).resolves.toHaveLength(2);
    await expect(
      repository.findForModeration(statsRequest.id),
    ).resolves.toMatchObject({ status: "approved" });
    await expect(
      repository.findForModeration("00000000-0000-4000-8000-000000009405"),
    ).resolves.toBeNull();
    await expect(
      repository.listActions(workflowRequest.id),
    ).resolves.toHaveLength(2);

    await expect(
      repository.createAuditPatch({
        affectedEntityId: playerId,
        affectedEntityType: "player",
        patch: { kills: 10 },
        reason: "approved correction",
        recalculationStatus: "completed",
        requestId: statsRequest.id,
      }),
    ).resolves.toMatchObject({
      affectedEntityId: playerId,
      recalculationStatus: "completed",
      requestId: statsRequest.id,
    });
    await expect(
      repository.createAuditPatch({
        affectedEntityType: "replay",
        patch: { winner: "west" },
        reason: "legacy winner",
        recalculationStatus: "pending",
        requestId: statsRequest.id,
      }),
    ).resolves.toMatchObject({
      affectedEntityId: null,
      affectedEntityType: "replay",
    });
    await expect(
      repository.listAuditPatchesForRequest(statsRequest.id),
    ).resolves.toHaveLength(2);

    await expect(
      repository.createWorkflowAction({
        action: "merge_players",
        moderatorUserId: moderator.id,
        payload: { sourcePlayerId: playerId },
        requestId: workflowRequest.id,
      }),
    ).resolves.toMatchObject({
      action: "merge_players",
      payload: { sourcePlayerId: playerId },
    });
    await expect(
      repository.listWorkflowActions(workflowRequest.id),
    ).resolves.toHaveLength(1);
  });

  it("validates references against PostgreSQL tables", async () => {
    await expect(
      references.exists({ id: playerId, type: "player" }),
    ).resolves.toBe(true);
    await expect(
      references.exists({ id: replayId, type: "replay" }),
    ).resolves.toBe(true);
    await expect(
      references.exists({ id: squadId, type: "squad" }),
    ).resolves.toBe(true);
    await expect(references.exists({ id: statId, type: "stat" })).resolves.toBe(
      true,
    );
    await expect(
      references.exists({
        id: "00000000-0000-4000-8000-000000009999",
        type: "player",
      }),
    ).resolves.toBe(false);
  });

  it("rolls back audit patch creation without an approval action", async () => {
    const requester = await createUser("steam-requester", "Requester"),
      statsRequest = await repository.create({
        description: "Patch stats",
        requesterUserId: requester.id,
        type: "stats_correction",
      });

    await expect(
      repository.createAuditPatch({
        affectedEntityType: "player",
        patch: { kills: 10 },
        reason: "not approved yet",
        recalculationStatus: "pending",
        requestId: statsRequest.id,
      }),
    ).rejects.toThrow();
    await expect(
      repository.listAuditPatchesForRequest(statsRequest.id),
    ).resolves.toHaveLength(0);
  });
});

const rotationId = "00000000-0000-4000-8000-000000001001",
  playerId = "00000000-0000-4000-8000-000000001002",
  squadId = "00000000-0000-4000-8000-000000001003",
  replayId = "00000000-0000-4000-8000-000000001004",
  statId = "00000000-0000-4000-8000-000000001005";

async function createUser(steamId: string, displayName: string) {
  const users = new PgAuthUserRepository(pool);
  return users.upsertSteamUser({ displayName, steamId });
}

async function seedReferences(): Promise<void> {
  await pool.query(
    "insert into rotations (id, name, starts_at) values ($1, 'Runtime Rotation', '2026-05-01T00:00:00.000Z')",
    [rotationId],
  );
  await pool.query(
    "insert into canonical_players (id, display_name) values ($1, 'Reference Player')",
    [playerId],
  );
  await pool.query(
    "insert into squads (id, name) values ($1, 'Reference Squad')",
    [squadId],
  );
  await pool.query(
    `
      insert into replays (
        id, source_system, source_replay_id, object_key, checksum, size_bytes,
        replay_timestamp, rotation_id, status
      )
      values ($1, 'solidgames', 'runtime-replay', 'raw/runtime.json', $2, 128,
        '2026-05-02T00:00:00.000Z', $3, 'parsed')
    `,
    [replayId, "c".repeat(64), rotationId],
  );
  await pool.query(
    "insert into player_stats (id, rotation_id, player_id, stats) values ($1, $2, $3, $4)",
    [statId, rotationId, playerId, { kills: 1 }],
  );
}
