/* eslint-disable no-magic-numbers */
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { runMigrations } from "../../../infra/db/migrate.js";
import { PgAuthUserRepository, PgSessionStore } from "../routes/postgres.js";

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
  pool = new Pool({ connectionString: config.databaseUrl });

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate auth_sessions, user_roles, roles, users cascade
  `);
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL auth stores", () => {
  it("persists Steam users, roles, and bootstrap admin roles", async () => {
    const users = new PgAuthUserRepository(pool, "steam-admin"),
      admin = await users.upsertSteamUser({
        displayName: "Admin",
        steamId: "steam-admin",
      }),
      player = await users.upsertSteamUser({
        displayName: "Player",
        steamId: "steam-player",
      });

    expect(admin.roles).toEqual(["admin"]);
    expect(player.roles).toEqual([]);

    await expect(users.setUserRoles(player.id, ["moderator"])).resolves.toEqual(
      {
        displayName: "Player",
        id: player.id,
        roles: ["moderator"],
        steamId: "steam-player",
      },
    );
    await expect(users.setUserRoles(admin.id, [])).resolves.toMatchObject({
      roles: ["admin"],
    });
    await expect(
      users.setUserRoles("00000000-0000-4000-8000-000000009001", ["admin"]),
    ).resolves.toBeNull();
    await expect(
      users.findById("00000000-0000-4000-8000-000000009002"),
    ).resolves.toBeNull();

    const restarted = new PgAuthUserRepository(pool, "steam-admin");
    await expect(restarted.findById(player.id)).resolves.toMatchObject({
      roles: ["moderator"],
    });
    await expect(restarted.listUsers()).resolves.toMatchObject([
      { displayName: "Admin" },
      { displayName: "Player" },
    ]);
  });

  it("persists, deletes, and expires sessions", async () => {
    const users = new PgAuthUserRepository(pool),
      sessions = new PgSessionStore(pool),
      user = await users.upsertSteamUser({
        displayName: "Session User",
        steamId: "steam-session",
      }),
      session = await sessions.create(user.id, 60);

    await expect(
      new PgSessionStore(pool).get(session.id),
    ).resolves.toMatchObject({
      id: session.id,
      userId: user.id,
    });
    await sessions.delete(session.id);
    await expect(sessions.get(session.id)).resolves.toBeNull();

    const expired = await sessions.create(user.id, -1);
    await expect(sessions.get(expired.id)).resolves.toBeNull();
  });

  it("rolls back role changes when a transaction fails", async () => {
    const users = new PgAuthUserRepository(pool);

    await expect(users.setUserRoles("not-a-uuid", ["admin"])).rejects.toThrow();
  });
});
