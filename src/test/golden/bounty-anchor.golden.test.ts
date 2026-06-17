/* eslint-disable init-declarations, max-lines, no-magic-numbers, @typescript-eslint/no-unnecessary-condition */
//
// bounty-anchor.golden.test.ts — hand-computed bounty anchors.
//
// Bounty is business-critical, so these assert SEMANTICS with toEqual hand-computed
// values (not only snapshot equality) — [testing-standards §G strong oracle]. A
// non-trivial bounty needs a seeded PREVIOUS rotation supplying effectiveness
// (RESEARCH §5): points = round₂((1+playerEff)·(1+squadEff)),
// eff = kills / max(1, deaths.total). Expected values are recomputed BY HAND from
// the formula — never by calling the production calculator (RESEARCH Don't-Hand-Roll).
//
// Source artifact: the parser-2 `aggregate-combat` floor artifact, where Alpha(eid 1)
// enemy-kills Bravo(eid 2) and Echo(eid 6) teamkills itself — covering player-only
// effectiveness, player+squad effectiveness, and the excluded-teamkill case.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../infra/db/migrate.js";
import {
  createRabbitMqParserRuntime,
  type RabbitMqParserRuntime,
} from "../../infra/queue/rabbitmq.js";
import { createStorageClient } from "../../infra/storage/client.js";
import { PgIngestRepository } from "../../modules/ingest/repository/repository.js";
import { IngestPromotionService } from "../../modules/ingest/service.js";
import { PgStatisticsRepository } from "../../modules/statistics/repository/repository.js";
import { ParserResultRecalculationService } from "../../modules/statistics/service/recalculation.js";

import {
  TRUNCATE_ALL,
  completedMessage,
  pollUntil,
  publishCompleted,
  purgeParserQueues,
} from "./fixtures/harness.js";
import {
  archivePresent,
  dockerReachable,
  goldenConfig,
  loadGoldenArtifacts,
} from "./fixtures/loader.js";

import type { ParserArtifact } from "../../modules/statistics/parser-artifact.js";

const config = goldenConfig(),
  pool = new Pool({ connectionString: config.databaseUrl }),
  runId = Date.now().toString(36),
  completedReplays = new Set<string>(),
  // The aggregate-combat artifact is the bounty source (Alpha→Bravo enemy_kill,
  // Echo→Echo teamkill). Loaded synchronously at collection; runtime infra-absence
  // is handled by the per-test early return.
  aggregateCombat: ParserArtifact | undefined = archivePresent()
    ? loadGoldenArtifacts().find((item) => item.name === "aggregate-combat")
        ?.artifact
    : undefined;

let infraReachable = false,
  broker: RabbitMqParserRuntime,
  storage: ReturnType<typeof createStorageClient>,
  s3: S3Client,
  ingestRepository: PgIngestRepository,
  promotionService: IngestPromotionService;

const CURRENT_STARTS = "2026-05-01T00:00:00.000Z",
  PREV_STARTS = "2026-04-01T00:00:00.000Z",
  REPLAY_TS = "2026-05-09T00:00:00.000Z";

beforeAll(async () => {
  if (!archivePresent()) {
    return;
  }
  infraReachable = await dockerReachable(config);
  if (!infraReachable) {
    return;
  }
  await runMigrations(config.databaseUrl);
  await purgeParserQueues(config.rabbitmqUrl);
  ingestRepository = new PgIngestRepository(pool);
  const statisticsRepository = new PgStatisticsRepository(pool),
    recalculation = new ParserResultRecalculationService(statisticsRepository);
  promotionService = new IngestPromotionService(ingestRepository);
  storage = createStorageClient(config);
  broker = await createRabbitMqParserRuntime(config);
  s3 = new S3Client({
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
    endpoint: config.s3.endpoint,
    forcePathStyle: config.s3.forcePathStyle,
    region: config.s3.region,
  });
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
});

afterAll(async () => {
  await broker?.close();
  s3?.destroy();
  await storage?.close();
  await pool.end();
});

beforeEach(async () => {
  if (infraReachable) {
    await pool.query(TRUNCATE_ALL);
  }
});

describe.skipIf(!archivePresent())("golden bounty anchors", () => {
  it("documents a clean skip when docker-compose is absent", () => {
    expect(typeof infraReachable).toBe("boolean");
  });

  it("(a) player-only effectiveness: Bravo prev kills=3/deaths=1 → Alpha points=4.00", async () => {
    if (!infraReachable) {
      return;
    }
    const seeds = await seedRotationsAndPlayers();
    // Victim Bravo previous-rotation effectiveness: 3 / max(1,1) = 3 → playerEff=3.
    // No squad seeded for Bravo → squadFactor=0. Alpha points = round₂(1·(1+3)·(1+0)) = 4.00.
    await seedPreviousPlayerStats({
      deathsTotal: 1,
      entityId: seeds.bravoId,
      kills: 3,
      rotationId: seeds.prevRotationId,
    });

    await driveBounty(seeds.currentRotationId);

    const alphaPoints = await rotationBountyPoints(
      seeds.currentRotationId,
      seeds.alphaId,
    );
    expect(alphaPoints).toEqual(4);
  });

  it("(b) player+squad effectiveness: Bravo player 2/1 + squad 4/2 → Alpha points=9.00", async () => {
    if (!infraReachable) {
      return;
    }
    const seeds = await seedRotationsAndPlayers();
    // Put Bravo in a squad and give that squad an active membership covering the replay,
    // so the kill carries victimSquadId. Player eff = 2/1 = 2 → playerFactor=2.
    // Squad eff = 4/2 = 2 → squadFactor=2. points = round₂(1·(1+2)·(1+2)) = 9.00.
    const squadId = await seedSquadForPlayer(seeds.bravoId);
    await seedPreviousPlayerStats({
      deathsTotal: 1,
      entityId: seeds.bravoId,
      kills: 2,
      rotationId: seeds.prevRotationId,
    });
    await seedPreviousSquadStats({
      deathsTotal: 2,
      entityId: squadId,
      kills: 4,
      rotationId: seeds.prevRotationId,
    });

    await driveBounty(seeds.currentRotationId);

    const alphaPoints = await rotationBountyPoints(
      seeds.currentRotationId,
      seeds.alphaId,
    );
    expect(alphaPoints).toEqual(9);
  });

  it("(c) excluded teamkill → 0: Echo teamkill earns no bounty", async () => {
    if (!infraReachable) {
      return;
    }
    const seeds = await seedRotationsAndPlayers();
    // No previous stats needed: a teamkill is excluded regardless (bounty.ts:107).
    await driveBounty(seeds.currentRotationId);

    const echoPoints = await rotationBountyPoints(
      seeds.currentRotationId,
      seeds.echoId,
    );
    expect(echoPoints).toEqual(0);
  });
});

interface AnchorSeeds {
  alphaId: string;
  bravoId: string;
  currentRotationId: string;
  echoId: string;
  prevRotationId: string;
}

async function seedRotationsAndPlayers(): Promise<AnchorSeeds> {
  if (aggregateCombat === undefined) {
    throw new Error("aggregate-combat fixture missing from floor archive");
  }
  const previous = await pool.query<{ id: string }>(
      "insert into rotations (name, starts_at, ends_at) values ('prev', $1, $2) returning id",
      [PREV_STARTS, CURRENT_STARTS],
    ),
    current = await pool.query<{ id: string }>(
      "insert into rotations (name, starts_at, ends_at) values ('current', $1, null) returning id",
      [CURRENT_STARTS],
    ),
    // Canonical players resolve by display_name (case-insensitive) — match the
    // artifact callsigns Alpha/Bravo/Echo (parser-artifact identity path).
    alpha = await insertCanonicalPlayer("Alpha"),
    bravo = await insertCanonicalPlayer("Bravo"),
    echo = await insertCanonicalPlayer("Echo");
  return {
    alphaId: alpha,
    bravoId: bravo,
    currentRotationId: current.rows[0]?.id ?? "",
    echoId: echo,
    prevRotationId: previous.rows[0]?.id ?? "",
  };
}

async function insertCanonicalPlayer(displayName: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "insert into canonical_players (display_name) values ($1) returning id",
    [displayName],
  );
  return result.rows[0]?.id ?? "";
}

async function seedSquadForPlayer(playerId: string): Promise<string> {
  const squad = await pool.query<{ id: string }>(
      "insert into squads (name, tag) values ('Bravo Squad', '[B]') returning id",
      [],
    ),
    squadId = squad.rows[0]?.id ?? "";
  await pool.query(
    `insert into squad_memberships (squad_id, player_id, valid_from, valid_to)
     values ($1, $2, $3, null)`,
    [squadId, playerId, PREV_STARTS],
  );
  return squadId;
}

interface PreviousStatsInput {
  deathsTotal: number;
  entityId: string;
  kills: number;
  rotationId: string;
}

async function seedPreviousPlayerStats(
  input: PreviousStatsInput,
): Promise<void> {
  await pool.query(
    `insert into player_stats (rotation_id, player_id, stats, game_type, is_show)
     values ($1, $2, $3::jsonb, 'sg', true)`,
    [
      input.rotationId,
      input.entityId,
      JSON.stringify({
        deaths: { total: input.deathsTotal },
        kills: input.kills,
      }),
    ],
  );
}

async function seedPreviousSquadStats(
  input: PreviousStatsInput,
): Promise<void> {
  await pool.query(
    `insert into squad_stats (rotation_id, squad_id, stats, game_type)
     values ($1, $2, $3::jsonb, 'sg')`,
    [
      input.rotationId,
      input.entityId,
      JSON.stringify({
        deaths: { total: input.deathsTotal },
        kills: input.kills,
      }),
    ],
  );
}

/**
 * Drive the real chain for the aggregate-combat artifact and force the replay's
 * game_type to 'sg' (the ingest path never sets game_type; without it the bounty
 * scope is empty — RESEARCH §5 / repository.ts auditScopes). Bounded-poll to the
 * finished chain, then the caller reads bounty_points.
 */
async function driveBounty(currentRotationId: string): Promise<void> {
  void currentRotationId;
  if (aggregateCombat === undefined) {
    throw new Error("aggregate-combat fixture missing");
  }
  const objectKey = `artifacts/v3/${runId}/bounty-${Date.now().toString(36)}.json`,
    checksum = `${"0".repeat(63)}2`,
    sourceReplayId = `bounty-${Date.now().toString(36)}`;

  await s3.send(
    new PutObjectCommand({
      Body: JSON.stringify(aggregateCombat),
      Bucket: config.s3.bucket,
      Key: objectKey,
    }),
  );
  await pool.query(
    `insert into ingest_staging_records
       (source_system, source_replay_id, object_key, checksum, size_bytes, replay_timestamp, promotion_evidence)
     values ('golden', $1, $2, $3, 123, $4, '{}'::jsonb)`,
    [sourceReplayId, objectKey, checksum, REPLAY_TS],
  );
  const [promotion] = await promotionService.promotePending({
    batchSize: 1,
    parserContractVersion: "3.0.0",
  });
  expect(promotion).toMatchObject({ status: "promoted" });

  const job = await pool.query<{ id: string; replay_id: string }>(
    "select id, replay_id from parse_jobs",
  );
  const jobId = job.rows[0]?.id ?? "",
    replayId = job.rows[0]?.replay_id ?? "";
  // Force sg game_type so the bounty scope is non-empty.
  await pool.query("update replays set game_type = 'sg' where id = $1", [
    replayId,
  ]);
  await pool.query("update parse_jobs set status = 'published' where id = $1", [
    jobId,
  ]);

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
  await pollUntil(async () => {
    const result = await pool.query<{ status: string }>(
      "select status from parse_jobs where id = $1",
      [jobId],
    );
    return (
      result.rows[0]?.status === "succeeded" && completedReplays.has(replayId)
    );
  });
}

async function rotationBountyPoints(
  rotationId: string,
  playerId: string,
): Promise<number | undefined> {
  const result = await pool.query<{ points: string }>(
    "select points from bounty_points where rotation_id = $1 and player_id = $2",
    [rotationId, playerId],
  );
  const raw = result.rows[0]?.points;
  return raw === undefined ? undefined : Number(raw);
}
