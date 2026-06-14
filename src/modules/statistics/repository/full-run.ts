/* eslint-disable unicorn/no-null */
import { PgStatisticsRepository } from "./repository.js";

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
