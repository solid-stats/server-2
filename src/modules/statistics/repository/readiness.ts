/* eslint-disable unicorn/no-null */
import type { ParserArtifact } from "../parser-artifact.js";
import type {
  IdentityReference,
  ParserResultIdentityEvidence,
  ReplayRotationEvidence,
  RotationRangeEvidence,
  StatisticsReadinessRepository,
} from "../readiness/readiness.js";
import type { Pool } from "pg";

interface RotationRangeRow {
  ends_at: Date | null;
  id: string;
  name: string;
  replay_count: string;
  starts_at: Date;
}

interface ReplayRotationRow {
  matched_rotation_ids: string[];
  replay_id: string;
  replay_timestamp: Date | null;
  rotation_match_count: string;
  source_replay_id: string;
  source_system: string;
}

interface ParserResultIdentityRow {
  parser_result_id: string;
  raw_snapshot: ParserArtifact;
  replay_id: string;
  replay_timestamp: Date | null;
  source_replay_id: string;
  source_system: string;
}

interface IdentityReferenceRow {
  display_name: string;
  nickname: string | null;
  observed_from: Date | null;
  observed_to: Date | null;
  player_id: string;
}

export class PgStatisticsReadinessRepository implements StatisticsReadinessRepository {
  public constructor(private readonly pool: Pool) {}

  public async getRotationRanges(): Promise<RotationRangeEvidence[]> {
    const result = await this.pool.query<RotationRangeRow>(`
      select rotations.id,
             rotations.name,
             rotations.starts_at,
             rotations.ends_at,
             count(replays.id)::text as replay_count
      from rotations
      left join replays on replays.replay_timestamp is not null
        and rotations.starts_at <= replays.replay_timestamp
        and (rotations.ends_at is null or rotations.ends_at > replays.replay_timestamp)
      group by rotations.id, rotations.name, rotations.starts_at, rotations.ends_at
      order by rotations.starts_at, rotations.id
    `);
    return result.rows.map((row) => ({
      endsAt: row.ends_at?.toISOString() ?? null,
      id: row.id,
      name: row.name,
      replayCount: Number(row.replay_count),
      startsAt: row.starts_at.toISOString(),
    }));
  }

  public async getReplayRotationEvidence(): Promise<ReplayRotationEvidence[]> {
    const result = await this.pool.query<ReplayRotationRow>(`
      select replays.id as replay_id,
             replays.source_system,
             replays.source_replay_id,
             replays.replay_timestamp,
             coalesce(
               array_remove(array_agg(rotations.id order by rotations.starts_at, rotations.id), null),
               '{}'
             ) as matched_rotation_ids,
             count(rotations.id)::text as rotation_match_count
      from replays
      left join rotations on replays.replay_timestamp is not null
        and rotations.starts_at <= replays.replay_timestamp
        and (rotations.ends_at is null or rotations.ends_at > replays.replay_timestamp)
      group by replays.id, replays.source_system, replays.source_replay_id,
        replays.replay_timestamp, replays.created_at
      order by replays.replay_timestamp nulls last, replays.created_at, replays.id
    `);
    return result.rows.map((row) => ({
      matchedRotationIds: row.matched_rotation_ids,
      replayId: row.replay_id,
      replayTimestamp: row.replay_timestamp?.toISOString() ?? null,
      rotationMatchCount: Number(row.rotation_match_count),
      sourceReplayId: row.source_replay_id,
      sourceSystem: row.source_system,
    }));
  }

  public async getCurrentParserIdentityEvidence(): Promise<
    ParserResultIdentityEvidence[]
  > {
    const result = await this.pool.query<ParserResultIdentityRow>(`
      select parser_results.id as parser_result_id,
             parser_results.raw_snapshot,
             replays.id as replay_id,
             replays.source_system,
             replays.source_replay_id,
             replays.replay_timestamp
      from parser_results
      join replays on replays.id = parser_results.replay_id
      where parser_results.status = 'current'
      order by replays.replay_timestamp nulls last, replays.created_at,
        parser_results.created_at, parser_results.id
    `);
    return result.rows.map((row) => ({
      parserResultId: row.parser_result_id,
      players: (row.raw_snapshot.players ?? []).map((player) => ({
        entityRef: String(player.eid),
        observedName: player.n,
        ...(player.sid === undefined ? {} : { steamId: player.sid }),
      })),
      replayId: row.replay_id,
      replayTimestamp: row.replay_timestamp?.toISOString() ?? null,
      sourceReplayId: row.source_replay_id,
      sourceSystem: row.source_system,
    }));
  }

  public async getIdentityReferences(): Promise<IdentityReference[]> {
    const result = await this.pool.query<IdentityReferenceRow>(`
      select canonical_players.id as player_id,
             canonical_players.display_name,
             player_nicknames.nickname,
             player_nicknames.observed_from,
             player_nicknames.observed_to
      from canonical_players
      left join player_nicknames on player_nicknames.player_id = canonical_players.id
      order by lower(coalesce(player_nicknames.nickname, canonical_players.display_name)),
        canonical_players.created_at, canonical_players.id
    `);
    return result.rows.map((row) => ({
      displayName: row.display_name,
      ...(row.nickname === null ? {} : { nickname: row.nickname }),
      observedFrom: row.observed_from?.toISOString() ?? null,
      observedTo: row.observed_to?.toISOString() ?? null,
      playerId: row.player_id,
    }));
  }
}
