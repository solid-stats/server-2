/* eslint-disable unicorn/no-null */
import {
  classifyGameType,
  extractMissionName,
} from "../game-type/classify-game-type.js";

import { PgStatisticsRepository } from "./repository.js";

import type { GameType } from "../game-type/game-type-config.js";
import type { ParserArtifact } from "../parser-artifact.js";
import type {
  FullRunLifecycleCounts,
  FullRunRecalculationRepository,
  ParserResultRecalculationTarget,
} from "../service/full-run-recalculation.js";
import type { Pool } from "pg";

const STAGING_STATUSES = [
    "pending",
    "processing",
    "promoted",
    "conflicted",
    "failed",
    "ignored",
  ],
  REPLAY_STATUSES = [
    "staged",
    "ready_for_parse",
    "parsed",
    "parse_failed",
    "archived",
  ],
  PARSE_JOB_STATUSES = [
    "queued",
    "published",
    "running",
    "succeeded",
    "failed",
    "retryable",
  ],
  PARSER_RESULT_STATUSES = ["current", "superseded", "failed"];

interface StatusCountRow {
  count: string;
  status: string;
}

interface AssignedRotationRow {
  replay_id: string;
  rotation_id: string | null;
}

interface ClassificationInputRow {
  raw_snapshot: ParserArtifact;
  replay_id: string;
  replay_timestamp: Date | null;
  source_replay_id: string;
}

interface CurrentParserResultRow {
  bounty_points_fresh: boolean;
  commander_stats_fresh: boolean;
  parser_result_created_at: Date;
  parser_result_id: string;
  player_stats_fresh: boolean;
  raw_snapshot: ParserArtifact;
  replay_id: string;
  replay_timestamp: Date | null;
  rotation_id: string | null;
  source_replay_id: string;
  source_system: string;
  squad_stats_fresh: boolean;
}

export class PgFullRunStatisticsRepository
  extends PgStatisticsRepository
  implements FullRunRecalculationRepository
{
  public constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Re-derives the rotation for every current-parser-result replay in one
   * set-based pass (replacing the per-replay `assignReplayRotation` used by the
   * single-replay path). A replay whose timestamp falls outside every rotation
   * window has its `rotation_id` set to `null`, so it is correctly excluded from
   * any rotation aggregate and reported as `missing_rotation`; the returned map
   * only contains replays that resolved to a rotation.
   */
  public async assignRotationsForCurrentReplays(): Promise<
    Map<string, string>
  > {
    const result = await this.pool.query<AssignedRotationRow>(`
      update replays r
      set rotation_id = (
        select rot.id
        from rotations rot
        where rot.starts_at <= r.replay_timestamp
          and (rot.ends_at is null or rot.ends_at > r.replay_timestamp)
        order by rot.starts_at desc
        limit 1
      )
      where r.replay_timestamp is not null
        and exists (
          select 1 from parser_results pr
          where pr.replay_id = r.id and pr.status = 'current'
        )
      returning r.id as replay_id, r.rotation_id
    `);
    return new Map(
      result.rows.flatMap((row) =>
        row.rotation_id === null ? [] : [[row.replay_id, row.rotation_id]],
      ),
    );
  }

  /**
   * Classifies the canonical `game_type` for every current-parser-result replay
   * in one set-based pass, mirroring `assignRotationsForCurrentReplays` (F7).
   *
   * The mace `<10 distinct players` rule (RESEARCH B.4) needs the per-replay
   * player count, which a pure mission-name SQL UPDATE cannot know, so this is
   * set-based but classification-in-app:
   *   1. One SELECT loads mission + timestamp + source link + artifact per
   *      current replay.
   *   2. The pure `classifyGameType()` resolves `'sg'|'mace'|'sm'|null` per row
   *      (NULL = excluded, D2).
   *   3. One multi-row `unnest` UPDATE writes `replays.game_type` for all rows
   *      (the F7/FW2 correlated-update pattern), NOT a per-row loop.
   * Returns a per-replay map of the resolved type (including the explicit `null`
   * entries for excluded replays).
   */
  public async classifyGameTypesForCurrentReplays(): Promise<
    Map<string, GameType | null>
  > {
    const loaded = await this.pool.query<ClassificationInputRow>(`
      select r.id as replay_id,
             r.source_replay_id,
             r.replay_timestamp,
             pr.raw_snapshot
      from replays r
      join parser_results pr on pr.replay_id = r.id and pr.status = 'current'
    `);

    const classified = loaded.rows.map((row) => ({
      gameType: classifyReplay(row),
      replayId: row.replay_id,
    }));

    if (classified.length > 0) {
      await this.pool.query(
        `
          update replays r
          set game_type = data.game_type
          from unnest($1::uuid[], $2::text[]) as data(replay_id, game_type)
          where r.id = data.replay_id
        `,
        [
          classified.map((entry) => entry.replayId),
          classified.map((entry) => entry.gameType),
        ],
      );
    }

    return new Map(
      classified.map((entry) => [entry.replayId, entry.gameType]),
    );
  }

  public async getFullRunLifecycleCounts(): Promise<FullRunLifecycleCounts> {
    const [staging, replays, parseJobs, parserResults] = await Promise.all([
      countStatuses(this.pool, "ingest_staging_records", STAGING_STATUSES),
      countStatuses(this.pool, "replays", REPLAY_STATUSES),
      countStatuses(this.pool, "parse_jobs", PARSE_JOB_STATUSES),
      countStatuses(this.pool, "parser_results", PARSER_RESULT_STATUSES),
    ]);
    return { parseJobs, parserResults, replays, staging };
  }

  public async listCurrentParserResultTargets(): Promise<
    ParserResultRecalculationTarget[]
  > {
    const result = await this.pool.query<CurrentParserResultRow>(`
      select pr.id as parser_result_id,
             pr.created_at as parser_result_created_at,
             pr.raw_snapshot,
             r.id as replay_id,
             r.source_system,
             r.source_replay_id,
             r.replay_timestamp,
             r.rotation_id,
             coalesce(
               (select max(calculated_at) from player_stats where rotation_id = r.rotation_id) >= pr.created_at,
               false
             ) as player_stats_fresh,
             coalesce(
               (select max(calculated_at) from squad_stats where rotation_id = r.rotation_id) >= pr.created_at,
               false
             ) as squad_stats_fresh,
             coalesce(
               (select max(calculated_at) from commander_side_stats where rotation_id = r.rotation_id) >= pr.created_at,
               false
             ) as commander_stats_fresh,
             coalesce(
               (select max(calculated_at) from bounty_points where rotation_id = r.rotation_id) >= pr.created_at,
               false
             ) as bounty_points_fresh
      from parser_results pr
      join replays r on r.id = pr.replay_id
      where pr.status = 'current'
      order by r.replay_timestamp nulls last, r.created_at, pr.created_at, pr.id
    `);
    return result.rows.map((row) => mapCurrentParserResultRow(row));
  }
}

async function countStatuses(
  pool: Pool,
  table: string,
  knownStatuses: readonly string[],
): Promise<Record<string, number>> {
  const result = await pool.query<StatusCountRow>(`
    select status::text as status, count(*)::text as count
    from ${table}
    group by status
  `);
  const counts = Object.fromEntries(knownStatuses.map((status) => [status, 0]));
  for (const row of result.rows) {
    counts[row.status] = Number(row.count);
  }
  return counts;
}

function classifyReplay(row: ClassificationInputRow): GameType | null {
  const replayBlock = row.raw_snapshot.replay ?? null;
  return classifyGameType({
    distinctPlayerCount: distinctPlayerCount(row.raw_snapshot),
    missionName: extractMissionName(replayBlock),
    replayDate: row.replay_timestamp,
    // Legacy excludeReplays keys are `/replays/<source_replay_id>` links (B.9).
    sourceLink: `/replays/${row.source_replay_id}`,
  });
}

/**
 * Distinct player count for the mace `<10` filter (B.4). Legacy uses the number
 * of distinct parsed players (`result.length`); the artifact `players[]` is
 * keyed by per-replay entity id (`eid`), so distinct `eid` is the player count.
 */
function distinctPlayerCount(artifact: ParserArtifact): number {
  const players = artifact.players ?? [];
  return new Set(players.map((player) => player.eid)).size;
}

function mapCurrentParserResultRow(
  row: CurrentParserResultRow,
): ParserResultRecalculationTarget {
  const players = row.raw_snapshot.players ?? [];
  return {
    missingIdentityPlayerCount: players.filter((player) =>
      hasMissingIdentityEvidence(player),
    ).length,
    parserResultCreatedAt: row.parser_result_created_at.toISOString(),
    parserResultId: row.parser_result_id,
    playerCount: players.length,
    replayId: row.replay_id,
    replayTimestamp: row.replay_timestamp?.toISOString() ?? null,
    rotationId: row.rotation_id,
    sourceReplayId: row.source_replay_id,
    sourceSystem: row.source_system,
    stale: isStale(row),
  };
}

function hasMissingIdentityEvidence(
  player: NonNullable<ParserArtifact["players"]>[number],
): boolean {
  return player.n.trim().length === 0;
}

function isStale(row: CurrentParserResultRow): boolean {
  return (
    row.rotation_id === null ||
    !row.player_stats_fresh ||
    !row.squad_stats_fresh ||
    !row.commander_stats_fresh ||
    !row.bounty_points_fresh
  );
}
