/* eslint-disable camelcase */
//
// harness.ts — shared golden-suite helpers (one place, no duplication — principle 9).
//
// - TRUNCATE_ALL: the truncate…cascade isolation statement (CONTEXT Step-0 override).
// - pollUntil: bounded DB-state poll with a HARD timeout ceiling — the only backstop
//   against the consumer's nack-requeue loop (RESEARCH §await-seam). A real-broker
//   integration poll is permitted ([testing-standards §E]) since deterministic clock
//   control is impossible for a live broker.
// - publishCompleted: publish a real parse.completed onto the parser exchange via a
//   dedicated confirm channel (the runtime's publishJson is typed for parse.requested
//   only, so the test owns a raw publisher for the completed message).
// - snapshotSurface: read + normalize the full observable DB surface plus GET /stats/*.
import * as amqp from "amqplib";

import {
  parseCompletedQueue,
  parseCompletedRoutingKey,
  parseFailedQueue,
  parseRequestedQueue,
  parserExchange,
  type ParseCompletedMessage,
} from "../../../infra/queue/messages.js";

import { UuidMap, normalizeRows, normalizeValue } from "./normalize.js";

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

export const TRUNCATE_ALL = `truncate
  parser_events, parser_results, player_stats, squad_stats, commander_side_stats,
  bounty_points, parse_jobs, replays, ingest_staging_records, rotations,
  squad_memberships, player_nicknames, player_steam_ids, squads, canonical_players
  cascade`;

const POLL_TIMEOUT_MS = 30_000,
  POLL_INTERVAL_MS = 200;

/**
 * Bounded poll: resolve when `predicate()` is true, throw on a HARD timeout. The
 * timeout is the backstop against the parse.completed nack-requeue loop — never
 * remove it. Plain setTimeout (no fake timers) is correct for a live-broker poll.
 */
export async function pollUntil(
  predicate: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(`pollUntil timed out after ${String(POLL_TIMEOUT_MS)}ms`);
}

/**
 * Purge the durable parser queues so a prior run's nack-requeued messages never
 * bleed into this run (the topology is durable — rabbitmq.ts:149). Asserts the
 * topology first so purge targets existing queues.
 */
export async function purgeParserQueues(url: string): Promise<void> {
  const connection = await amqp.connect(url),
    channel = await connection.createChannel();
  await channel.assertExchange(parserExchange, "direct", { durable: true });
  for (const queue of [
    parseRequestedQueue,
    parseCompletedQueue,
    parseFailedQueue,
  ]) {
    await channel.assertQueue(queue, { durable: true });
    await channel.purgeQueue(queue);
  }
  await channel.close();
  await connection.close();
}

/** A dedicated raw publisher for parse.completed (broker.publishJson is typed for requests). */
export async function publishCompleted(
  runtimeUrl: string,
  message: ParseCompletedMessage,
): Promise<void> {
  const connection = await amqp.connect(runtimeUrl),
    channel = await connection.createConfirmChannel();
  await channel.assertExchange(parserExchange, "direct", { durable: true });
  await new Promise<void>((resolve, reject) => {
    channel.publish(
      parserExchange,
      parseCompletedRoutingKey,
      Buffer.from(JSON.stringify(message)),
      { contentType: "application/json", persistent: true },
      (error) => {
        if (error === null) {
          resolve();
        } else {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );
  });
  await channel.close();
  await connection.close();
}

/** Build a well-formed parse.completed message for a job/replay/key/checksum. */
export function completedMessage(input: {
  bucket: string;
  checksum: string;
  jobId: string;
  objectKey: string;
  replayId: string;
}): ParseCompletedMessage {
  return {
    artifact: { bucket: input.bucket, key: input.objectKey },
    artifact_checksum: { algorithm: "sha256", value: input.checksum },
    artifact_size_bytes: 1234,
    job_id: input.jobId,
    message_type: "parse.completed",
    parser: { name: "replay-parser-2", version: "0.1.0" },
    parser_contract_version: "3.0.0",
    replay_id: input.replayId,
    source_checksum: { algorithm: "sha256", value: input.checksum },
  };
}

const SURFACE_TABLES: {
  key: (row: Record<string, unknown>) => string;
  sql: string;
  table: string;
}[] = [
  {
    key: (row) => String(row["source_replay_id"]),
    sql: "select * from replays",
    table: "replays",
  },
  {
    key: (row) =>
      `${String(row["status"])}|${String(row["parser_contract_version"])}`,
    sql: "select * from parse_jobs",
    table: "parse_jobs",
  },
  {
    key: (row) => String(row["status"]),
    sql: "select * from parser_results",
    table: "parser_results",
  },
  {
    key: (row) =>
      `${String(row["event_type"])}|${String(row["observed_player_ref"])}|${JSON.stringify(row["source_ref"])}`,
    sql: "select * from parser_events",
    table: "parser_events",
  },
  {
    key: (row) => JSON.stringify(row["stats"]),
    sql: "select * from player_stats",
    table: "player_stats",
  },
  {
    key: (row) => JSON.stringify(row["stats"]),
    sql: "select * from squad_stats",
    table: "squad_stats",
  },
  {
    key: (row) => `${String(row["side"])}|${String(row["game_type"])}`,
    sql: "select * from commander_side_stats",
    table: "commander_side_stats",
  },
  {
    key: (row) => String(row["points"]),
    sql: "select * from bounty_points",
    table: "bounty_points",
  },
  {
    key: (row) => String(row["status"]),
    sql: "select * from ingest_staging_records",
    table: "ingest_staging_records",
  },
];

const STATS_ENDPOINTS = [
  "/stats/overview",
  "/stats/players",
  "/stats/squads",
  "/stats/bounty",
  "/stats/replays",
];

/**
 * Read + normalize the full observable DB surface (uuid->token, timestamp redaction,
 * row sort by natural key) plus the GET /stats/* responses. One shared UuidMap so the
 * SAME uuid maps to the SAME token across tables AND the API responses.
 */
export async function snapshotSurface(
  pool: Pool,
  app: FastifyInstance,
): Promise<Record<string, unknown>> {
  const uuids = new UuidMap(),
    surface: Record<string, unknown> = {};
  for (const entry of SURFACE_TABLES) {
    const result = await pool.query<Record<string, unknown>>(entry.sql);
    surface[entry.table] = normalizeRows(result.rows, uuids, entry.key);
  }
  for (const url of STATS_ENDPOINTS) {
    const response = await app.inject({ method: "GET", url });
    surface[`GET ${url}`] = normalizeValue(response.json(), uuids);
  }
  return surface;
}
