/* eslint-disable max-lines-per-function, no-magic-numbers */
/**
 * Integration tests for the SEO sitemap routes (REPLAY-04, T-17-10 to T-17-13).
 *
 * Uses a real PostgreSQL connection (same env block as steamid-leak-guard) to
 * seed two replays with slugs and one with a NULL slug, then asserts:
 * - GET /sitemap.xml → 200, application/xml, well-formed sitemapindex with one child
 * - GET /sitemap-replays-0.xml → 200, application/xml, well-formed urlset with the
 *   two slugged replay URLs; the null-slug row is absent
 * - GET /sitemap-replays-invalid.xml → 400 (non-numeric :n)
 * - GET /sitemap-replays--1.xml → 400 (negative :n)
 * - XML structure well-formedness (declaration + single root element)
 * - content-type includes application/xml
 */

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import { runMigrations } from "../../infra/db/migrate.js";
import { PgPublicStatsReadModel } from "../../modules/public-stats/repository.js";

const BAD_REQUEST = 400;

const SITEMAP_REPLAY_1_ID = "00000000-0000-4000-8000-000000000a01",
  SITEMAP_REPLAY_2_ID = "00000000-0000-4000-8000-000000000a02",
  SITEMAP_REPLAY_NULL_ID = "00000000-0000-4000-8000-000000000a03",
  SITEMAP_BASE_URL = "https://solidstats.example.com";

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
};

describe("sitemap routes integration (REPLAY-04)", () => {
  const config = loadConfig(env),
    pool = new Pool({ connectionString: config.databaseUrl });

  beforeAll(async () => {
    await runMigrations(config.databaseUrl);

    // Pre-clean any leftover rows from prior test runs
    await pool.query("delete from replays where id = any($1::uuid[])", [
      [SITEMAP_REPLAY_1_ID, SITEMAP_REPLAY_2_ID, SITEMAP_REPLAY_NULL_ID],
    ]);

    // Replay 1: has slug. Use distinct checksums (e/f/0) not used elsewhere.
    await pool.query(
      `insert into replays (id, source_system, source_replay_id, object_key,
         checksum, size_bytes, replay_timestamp, status, slug)
       values ($1, 'solidgames', 'sitemap-test-1', 'raw/sitemap-test-1.json',
         $2, 128, '2026-05-01T10:00:00.000Z', 'parsed', 'sitemap-test-slug-1')`,
      [SITEMAP_REPLAY_1_ID, "e".repeat(64)],
    );

    // Replay 2: has slug
    await pool.query(
      `insert into replays (id, source_system, source_replay_id, object_key,
         checksum, size_bytes, replay_timestamp, status, slug)
       values ($1, 'solidgames', 'sitemap-test-2', 'raw/sitemap-test-2.json',
         $2, 128, '2026-05-02T10:00:00.000Z', 'parsed', 'sitemap-test-slug-2')`,
      [SITEMAP_REPLAY_2_ID, "f".repeat(64)],
    );

    // Replay 3: NULL slug — must be skipped by the sitemap enumerators.
    // Use 'staged' status (a valid replay_status enum value).
    await pool.query(
      `insert into replays (id, source_system, source_replay_id, object_key,
         checksum, size_bytes, replay_timestamp, status, slug)
       values ($1, 'solidgames', 'sitemap-test-null', 'raw/sitemap-test-null.json',
         $2, 128, '2026-05-03T10:00:00.000Z', 'staged', null)`,
      [SITEMAP_REPLAY_NULL_ID, "0".repeat(64)],
    );
  });

  afterAll(async () => {
    await pool.query("delete from replays where id = any($1::uuid[])", [
      [SITEMAP_REPLAY_1_ID, SITEMAP_REPLAY_2_ID, SITEMAP_REPLAY_NULL_ID],
    ]);
    await pool.end();
  });

  it("GET /sitemap.xml returns 200 with content-type application/xml", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/xml");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap.xml returns a well-formed sitemapindex with one child entry", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      const body = response.payload;

      // Well-formedness: XML declaration + single root element
      expect(body).toMatch(/^<\?xml version="1\.0"/u);
      expect(body).toContain("<sitemapindex");
      expect(body).toContain("</sitemapindex>");

      // Exactly one child sitemap (two slugged replays << 50,000)
      const childCount = (body.match(/<sitemap>/gu) ?? []).length;
      expect(childCount).toBe(1);
      expect(body).toContain(`${SITEMAP_BASE_URL}/sitemap-replays-0.xml`);
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-0.xml returns 200 with content-type application/xml", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays-0.xml",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/xml");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-0.xml returns well-formed urlset with non-null-slug URLs only", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays-0.xml",
      });

      const body = response.payload;

      // Well-formedness: XML declaration + single root element
      expect(body).toMatch(/^<\?xml version="1\.0"/u);
      expect(body).toContain("<urlset");
      expect(body).toContain("</urlset>");

      // The two slugged replays appear under the configured base URL
      expect(body).toContain(`${SITEMAP_BASE_URL}/replays/sitemap-test-slug-1`);
      expect(body).toContain(`${SITEMAP_BASE_URL}/replays/sitemap-test-slug-2`);

      // The null-slug replay MUST be absent
      expect(body).not.toContain("sitemap-test-null");
      expect(body).not.toContain("sitemap-test-3");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-invalid.xml returns 400 for non-numeric :n", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays-invalid.xml",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays--1.xml returns 400 for negative :n", async () => {
    const app = await buildApp({
      publicBaseUrl: SITEMAP_BASE_URL,
      publicStatsReadModel: new PgPublicStatsReadModel(pool),
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays--1.xml",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });
});
