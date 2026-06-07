import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { loadConfig, type AppConfig } from "../../config/env.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { createLoggerOptions } from "../../infra/logging/logger.js";
import { PgPublicStatsReadModel } from "../../modules/public-stats/repository.js";

const BAD_REQUEST = 400;

/**
 * Matches a full Steam64 identifier (`7656119` + 10 digits). The acceptance
 * contract for SEC-01/SEC-02 is that this pattern finds ZERO matches across
 * every public response body, captured cursor token, structured log field, and
 * error payload. `u` flag keeps the regex Unicode-safe; `g` is intentionally
 * omitted so `.test` has no shared lastIndex state.
 */
const STEAM64_PATTERN = /7656119\d{10}/u;

/**
 * Reusable guard: serialize any value and assert it carries no full Steam64.
 * Exported for reuse by Plan 14-03's real-pg leak sweep. Proven to catch a
 * planted leak by the negative self-test below — it is not a vacuous assertion.
 */
export function expectNoSteam64(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  expect(serialized).not.toMatch(STEAM64_PATTERN);
}

const PUBLIC_LIST_ROUTES = [
    "/stats/players",
    "/stats/squads",
    "/stats/bounty",
    "/stats/leaderboards",
  ],
  PLAYER_ID = "00000000-0000-4000-8000-000000000502",
  SQUAD_ID = "00000000-0000-4000-8000-000000000503",
  ROTATION_ID = "00000000-0000-4000-8000-000000000504",
  // A placeholder replay ID used for the empty-DB buildApp() sweep.
  // The routes 404 (no data), but the sweep still exercises the serialization
  // path and verifies no Steam64 leaks through error bodies.
  SWEEP_REPLAY_ID = "00000000-0000-4000-8000-000000000505",
  // Phase 16: new history + rotation-detail routes swept for Steam64 leaks.
  // Phase 17: replay detail + events routes added to the sweep.
  // Phase 17 (REPLAY-04, T-17-12): sitemap routes swept defensively — slugs are
  // pattern-restricted to ^[A-Za-z0-9-]+$ so cannot contain a Steam64, but we
  // sweep anyway as defense-in-depth.
  PUBLIC_DETAIL_ROUTES = [
    `/stats/players/${PLAYER_ID}`,
    `/stats/squads/${SQUAD_ID}`,
    `/stats/rotations/${ROTATION_ID}`,
    `/stats/players/${PLAYER_ID}/name-history`,
    `/stats/players/${PLAYER_ID}/membership-history`,
    `/stats/squads/${SQUAD_ID}/membership-history`,
    `/stats/replays/${SWEEP_REPLAY_ID}`,
    `/stats/replays/${SWEEP_REPLAY_ID}/events`,
    "/sitemap.xml",
    "/sitemap-replays-0.xml",
  ];

describe("expectNoSteam64 guard helper", () => {
  it("passes for a payload with no full Steam64", () => {
    expect(() => {
      expectNoSteam64({ steamIds: ["...7890"], value: "safe" });
    }).not.toThrow();
  });

  it("throws when a full Steam64 is planted in an object (negative self-test)", () => {
    expect(() => {
      expectNoSteam64({ steamId: "76561198012347890" });
    }).toThrow();
  });

  it("throws when a full Steam64 is planted in a raw string (negative self-test)", () => {
    expect(() => {
      expectNoSteam64("leak: 76561198012347890 here");
    }).toThrow();
  });
});

describe("steamId leak guard - pino redaction", () => {
  it("redacts every SteamID-bearing log field", () => {
    const options = createLoggerOptions({ logLevel: "info" } as AppConfig);

    if (
      typeof options !== "object" ||
      !("redact" in options) ||
      Array.isArray(options.redact)
    ) {
      throw new TypeError(
        "expected structured logger options with redact config",
      );
    }

    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        "*.steamId",
        "*.steamIds",
        "*.steam_id",
        "*.steam_ids",
      ]),
    );
  });
});

describe("steamId leak guard - public route sweep", () => {
  it.each([...PUBLIC_LIST_ROUTES, ...PUBLIC_DETAIL_ROUTES])(
    "emits zero full Steam64 over %s response body",
    async (url) => {
      const app = await buildApp();

      try {
        const response = await app.inject({ method: "GET", url }),
          contentType = response.headers["content-type"] ?? "";

        // Sitemap routes respond with application/xml; calling response.json()
        // on an XML body throws a SyntaxError. Assert only over the raw payload
        // string for XML responses — that is sufficient since expectNoSteam64
        // accepts strings directly.
        if (!contentType.includes("application/xml")) {
          expectNoSteam64(response.json());
        }
        expectNoSteam64(response.payload);
      } finally {
        await app.close();
      }
    },
  );

  // Plan 14-03 wired BadCursorError -> 400. A malformed cursor must 400 AND its
  // error body/payload must never echo a Steam64 (the reason string is fixed).
  // `cursor=` covers the players/squads/bounty list routes; `/stats/leaderboards`
  // paginates per-surface (`bountyCursor`/`playersCursor`/`squadsCursor`) so it
  // is swept with one of its own cursor params.
  const MALFORMED_CURSOR_CASES: { param: string; url: string }[] = [
      { param: "cursor", url: "/stats/players" },
      { param: "cursor", url: "/stats/squads" },
      { param: "cursor", url: "/stats/bounty" },
      { param: "bountyCursor", url: "/stats/leaderboards" },
    ],
    // A planted Steam64 in the cursor must NOT be reflected in the 400 body.
    LEAKY_CURSOR = Buffer.from(
      JSON.stringify({ leak: "76561198012347890" }),
      "utf8",
    ).toString("base64url");

  it.each(MALFORMED_CURSOR_CASES)(
    "emits zero full Steam64 over the malformed-cursor 400 error path on $url ($param)",
    async ({ param, url }) => {
      const app = await buildApp();

      try {
        const response = await app.inject({
          method: "GET",
          url: `${url}?${param}=${LEAKY_CURSOR}`,
        });

        expect(response.statusCode).toBe(BAD_REQUEST);
        expectNoSteam64(response.json());
        expectNoSteam64(response.payload);
      } finally {
        await app.close();
      }
    },
  );
});

const REAL_PG_PLAYER_ID = "00000000-0000-4000-8000-000000000901",
  REAL_PG_SQUAD_ID = "00000000-0000-4000-8000-000000000902",
  REAL_PG_ROTATION_ID = "00000000-0000-4000-8000-000000000903",
  // Phase 17: real-pg replay seed IDs for the leak-guard sweep.
  REAL_PG_REPLAY_ID = "00000000-0000-4000-8000-000000000904",
  REAL_PG_PARSE_JOB_ID = "00000000-0000-4000-8000-000000000905",
  REAL_PG_PARSER_RESULT_ID = "00000000-0000-4000-8000-000000000906",
  // A full Steam64 that MUST be masked before it reaches the profile body.
  LEAKED_STEAM64 = "76561198012347890";

describe("steamId leak guard - real-pg profile sweep", () => {
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
      S3_SECRET_ACCESS_KEY:
        process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
    },
    config = loadConfig(env),
    pool = new Pool({ connectionString: config.databaseUrl });

  beforeAll(async () => {
    await runMigrations(config.databaseUrl);
    // Clean up any leftover rows from prior test runs
    await pool.query("delete from canonical_players where id = $1", [
      REAL_PG_PLAYER_ID,
    ]);
    await pool.query("delete from squads where id = $1", [REAL_PG_SQUAD_ID]);
    await pool.query("delete from rotations where id = $1", [
      REAL_PG_ROTATION_ID,
    ]);

    // Seed player with planted Steam64 steam_id
    await pool.query(
      "insert into canonical_players (id, display_name) values ($1, 'Leaky')",
      [REAL_PG_PLAYER_ID],
    );
    await pool.query(
      "insert into player_steam_ids (player_id, steam_id) values ($1, $2)",
      [REAL_PG_PLAYER_ID, LEAKED_STEAM64],
    );

    // Seed a nickname for the player so name-history returns a real entry
    await pool.query(
      `insert into player_nicknames (player_id, nickname, observed_from, observed_to, source_replay_id)
       values ($1, 'LeakyNick', '2026-01-01T00:00:00.000Z', null, null)`,
      [REAL_PG_PLAYER_ID],
    );

    // Seed a squad and membership for membership-history routes
    await pool.query(
      "insert into squads (id, name) values ($1, 'LeakySquad')",
      [REAL_PG_SQUAD_ID],
    );
    await pool.query(
      `insert into squad_memberships (squad_id, player_id, valid_from, valid_to)
       values ($1, $2, '2026-01-01T00:00:00.000Z', null)`,
      [REAL_PG_SQUAD_ID, REAL_PG_PLAYER_ID],
    );

    // Seed a rotation for the rotation-detail route
    await pool.query(
      `insert into rotations (id, name, slug, starts_at, ends_at)
       values ($1, 'Leaky Rotation', 'leaky-rotation', '2026-01-01T00:00:00.000Z', null)`,
      [REAL_PG_ROTATION_ID],
    );

  });

  afterAll(async () => {
    await pool.query("delete from canonical_players where id = $1", [
      REAL_PG_PLAYER_ID,
    ]);
    await pool.query("delete from squads where id = $1", [REAL_PG_SQUAD_ID]);
    await pool.query("delete from rotations where id = $1", [
      REAL_PG_ROTATION_ID,
    ]);
    await pool.end();
  });

  it("masks the Steam64 so the seeded profile body emits zero full Steam64", async () => {
    const app = await buildApp({
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${REAL_PG_PLAYER_ID}`,
      });

      expect(response.statusCode).toBe(200);
      expectNoSteam64(response.json());
      expectNoSteam64(response.payload);
    } finally {
      await app.close();
    }
  });

  // Phase 16: verify new history + rotation-detail endpoints emit zero Steam64
  // when the seeded player carries a full Steam64 in player_steam_ids.
  it.each([
    {
      desc: "player name-history",
      url: `/stats/players/${REAL_PG_PLAYER_ID}/name-history`,
    },
    {
      desc: "player membership-history",
      url: `/stats/players/${REAL_PG_PLAYER_ID}/membership-history`,
    },
    {
      desc: "squad membership-history",
      url: `/stats/squads/${REAL_PG_SQUAD_ID}/membership-history`,
    },
    {
      desc: "rotation detail",
      url: `/stats/rotations/${REAL_PG_ROTATION_ID}`,
    },
  ])(
    "emits zero full Steam64 on real-pg seeded $desc response (T-16-16)",
    async ({ url }) => {
      const app = await buildApp({
        publicStatsReadModel: new PgPublicStatsReadModel(pool),
      });

      try {
        const response = await app.inject({ method: "GET", url });

        // Any status — what matters is zero Steam64 leakage in the body.
        expectNoSteam64(response.json());
        expectNoSteam64(response.payload);
      } finally {
        await app.close();
      }
    },
  );
});

// Phase 17 (T-17-08): replay detail + events routes must emit zero Steam64.
// The seeded replay carries LEAKED_STEAM64 in raw_snapshot.players[].sid (detail
// vector) AND in parser_events.payload at three paths (events vector — B-1):
// payload.player.steam_id, payload.attacker.steam_id, payload.context.crew[2].steam_id.
// Without the events seeding the events guard would pass vacuously.
describe("steamId leak guard - real-pg replay sweep (T-17-08)", () => {
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
      S3_SECRET_ACCESS_KEY:
        process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
    },
    config = loadConfig(env),
    replayPool = new Pool({ connectionString: config.databaseUrl });

  beforeAll(async () => {
    await runMigrations(config.databaseUrl);
    // Pre-clean any leftover rows from a prior run
    await replayPool.query("delete from replays where id = $1", [
      REAL_PG_REPLAY_ID,
    ]);

    // Seed a replay with a slug so the route resolves it.
    // Use distinct checksums that do not collide with postgres.test.ts seeds.
    await replayPool.query(
      `insert into replays (id, source_system, source_replay_id, object_key,
         checksum, size_bytes, replay_timestamp, status, slug)
       values ($1, 'solidgames', 'leaky-replay-guard', 'raw/leaky-replay-guard.json',
         $2, 128, '2026-05-10T10:00:00.000Z', 'parsed', 'leaky-replay-guard')`,
      [REAL_PG_REPLAY_ID, "9".repeat(64)],
    );
    await replayPool.query(
      `insert into parse_jobs (id, replay_id, parser_contract_version,
         object_key, checksum, status)
       values ($1, $2, 'v1', 'raw/leaky-replay-guard.json', $3, 'succeeded')`,
      [REAL_PG_PARSE_JOB_ID, REAL_PG_REPLAY_ID, "8".repeat(64)],
    );

    // raw_snapshot carries the Steam64 in players[].sid — detail route leak vector
    const leakySnapshot = {
      players: [
        {
          d: 1,
          eid: 1,
          k: 2,
          n: "LeakyPlayer",
          s: "west",
          sid: LEAKED_STEAM64,
          tk: 0,
        },
      ],
      replay: { mission: "Altis" },
    };
    await replayPool.query(
      `insert into parser_results (id, replay_id, parse_job_id,
         parser_contract_version, status, raw_snapshot)
       values ($1, $2, $3, 'v1', 'current', $4::jsonb)`,
      [
        REAL_PG_PARSER_RESULT_ID,
        REAL_PG_REPLAY_ID,
        REAL_PG_PARSE_JOB_ID,
        JSON.stringify(leakySnapshot),
      ],
    );

    // parser_events payload carries the Steam64 at multiple paths (events vector — B-1):
    // payload.player.steam_id, payload.attacker.steam_id, payload.context.crew[2].steam_id
    const leakyPayload = {
      attacker: { name: "LeakyAttacker", steam_id: LEAKED_STEAM64 },
      context: {
        crew: [
          { name: "CrewA" },
          { name: "CrewB" },
          { name: "CrewC", steam_id: LEAKED_STEAM64 },
        ],
      },
      player: { name: "LeakyPlayer", steam_id: LEAKED_STEAM64 },
      weapon: "Rifle",
    };
    await replayPool.query(
      `insert into parser_events (parser_result_id, event_type, occurred_at,
         observed_player_ref, payload, source_ref)
       values ($1, 'kill', '2026-05-10T12:00:00.000Z', 'leaky-ref',
         $2::jsonb, '{}'::jsonb)`,
      [REAL_PG_PARSER_RESULT_ID, JSON.stringify(leakyPayload)],
    );
  });

  afterAll(async () => {
    // parser_events + parser_results cascade-delete from replays via FK
    await replayPool.query("delete from replays where id = $1", [
      REAL_PG_REPLAY_ID,
    ]);
    await replayPool.end();
  });

  it("emits zero full Steam64 on the seeded replay detail response (detail vector)", async () => {
    const app = await buildApp({
      publicStatsReadModel: new PgPublicStatsReadModel(replayPool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${REAL_PG_REPLAY_ID}`,
      });

      expect(response.statusCode).toBe(200);
      expectNoSteam64(response.json());
      expectNoSteam64(response.payload);
    } finally {
      await app.close();
    }
  });

  it("emits zero full Steam64 on the seeded replay events response (events payload B-1 vector)", async () => {
    const app = await buildApp({
      publicStatsReadModel: new PgPublicStatsReadModel(replayPool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${REAL_PG_REPLAY_ID}/events`,
      });

      expect(response.statusCode).toBe(200);
      // Assert over both the parsed body and raw payload string — the Steam64
      // was planted at payload.player.steam_id, payload.attacker.steam_id, and
      // payload.context.crew[2].steam_id; scrubPayload must drop/mask all three.
      expectNoSteam64(response.json());
      expectNoSteam64(response.payload);
    } finally {
      await app.close();
    }
  });
});
