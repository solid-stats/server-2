//
// loader.ts — the ONE shared fixture loader/unpacker + skip guards for the golden oracle.
//
// Unpacks the committed artifacts.tar.gz to a per-run tmp dir and exposes the real
// ParserArtifact JSONs typed as the PRODUCTION `ParserArtifact` (never a hand-mirrored
// shape). Two guards drive clean SKIP (never FAIL) when infra/archive are absent:
//   - archivePresent(): the committed fixture archive exists.
//   - dockerReachable(config): PG + RabbitMQ + S3 all answer a health probe.
//
// [tests Integration Harness] real adapters via createDbClient/createQueueClient/
// createStorageClient; [testing-standards §B] skip cleanly without containers.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, type AppConfig } from "../../../config/env.js";
import { createDbClient } from "../../../infra/db/client.js";
import { createQueueClient } from "../../../infra/queue/client.js";
import { createStorageClient } from "../../../infra/storage/client.js";

import type { ParserArtifact } from "../../../modules/statistics/parser-artifact.js";

// Fixed-port docker-compose defaults mirrored from adapters.test.ts / postgres.test.ts.
export const goldenEnvironment = {
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

export function goldenConfig(): AppConfig {
  return loadConfig(goldenEnvironment);
}

const ARCHIVE_PATH = fileURLToPath(
  new URL("artifacts.tar.gz", import.meta.url),
);

/** True when the committed fixture archive exists; false → suites skip cleanly. */
export function archivePresent(): boolean {
  return existsSync(ARCHIVE_PATH);
}

export interface GoldenArtifact {
  artifact: ParserArtifact;
  name: string;
}

/**
 * Unpack the committed archive to a fresh per-run tmp dir and return the parsed
 * artifacts (typed as the production `ParserArtifact`). Caller guards on
 * archivePresent() first; this throws if the archive is missing.
 */
export function loadGoldenArtifacts(): GoldenArtifact[] {
  if (!archivePresent()) {
    throw new Error(`golden fixture archive missing at ${ARCHIVE_PATH}`);
  }
  const unpackDirectory = mkdtempSync(join(tmpdir(), "golden-"));
  execFileSync("tar", ["xzf", ARCHIVE_PATH, "-C", unpackDirectory]);
  return readdirSync(unpackDirectory)
    .filter((file) => file.endsWith(".json"))
    .toSorted((left, right) => left.localeCompare(right))
    .map((file) => ({
      artifact: JSON.parse(
        readFileSync(join(unpackDirectory, file), "utf8"),
      ) as ParserArtifact,
      name: file.replace(/\.json$/u, ""),
    }));
}

/**
 * Probe PG + RabbitMQ + S3 via the SAME adapters production wires. Returns false on
 * any connect/health failure so suites SKIP (not FAIL) when docker-compose is down.
 */
export async function dockerReachable(config: AppConfig): Promise<boolean> {
  const db = createDbClient(config),
    queue = createQueueClient(config),
    storage = createStorageClient(config);
  try {
    const results = await Promise.all([
      db.check(),
      queue.check(),
      storage.check(),
    ]);
    return results.every((result) => result.status === "ok");
  } catch {
    return false;
  } finally {
    await Promise.allSettled([db.close(), queue.close(), storage.close()]);
  }
}

/**
 * The ONE shared golden skip-guard (principle 9 — no per-suite duplication of the
 * archive-check + infra-probe sequence). A golden suite runs its live block ONLY
 * when BOTH the committed fixture archive is present AND the docker-compose infra
 * (PG + RabbitMQ + S3) answers a health probe; otherwise every suite SKIPS cleanly
 * (never FAILS), so `pnpm test:golden` is a green no-op without Docker/archive.
 *
 * Returns true when the live chain may run. Each suite calls this once in
 * `beforeAll` and gates its `beforeEach`/`it` bodies on the returned flag (the
 * probe cannot be awaited inside `describe.skipIf`, so the per-suite flag is the
 * runtime gate; `describe.skipIf(!archivePresent())` skips at collection time when
 * the archive is absent so empty `test.each` tables never collect a phantom case).
 */
export async function goldenInfraReachable(
  config: AppConfig,
): Promise<boolean> {
  if (!archivePresent()) {
    return false;
  }
  return dockerReachable(config);
}
