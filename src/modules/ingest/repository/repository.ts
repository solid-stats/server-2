/* eslint-disable camelcase, class-methods-use-this, max-lines, max-params, unicorn/no-null */
import type {
  IngestStagingRecord,
  PageQuery,
  PageResult,
  ParseJobFilters,
  ParseJobHistoryEntry,
  ParseJobRecord,
  ReplayRecord,
  StagingFilters,
} from "../types.js";
import type { Pool, PoolClient } from "pg";

interface StagingRow {
  id: string;
  source_system: string;
  source_replay_id: string;
  object_key: string;
  checksum: string;
  size_bytes: string;
  replay_timestamp: Date | null;
  status: IngestStagingRecord["status"];
  promotion_evidence: Record<string, unknown>;
  conflict_details: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ReplayRow {
  id: string;
  source_system: string;
  source_replay_id: string;
  object_key: string;
  checksum: string;
  size_bytes: string;
  replay_timestamp: Date | null;
  status: string;
  promotion_evidence: Record<string, unknown>;
  promoted_from_staging_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ParseJobRow {
  id: string;
  replay_id: string;
  parser_contract_version: string;
  object_key: string;
  checksum: string;
  status: ParseJobRecord["status"];
  attempts: number;
  published_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  error: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface ParseJobHistoryRow {
  id: string;
  job_id: string;
  action: ParseJobHistoryEntry["action"];
  status_from: ParseJobHistoryEntry["statusFrom"];
  status_to: ParseJobHistoryEntry["statusTo"];
  actor_user_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

export type ParseJobRetryResult =
  | { kind: "conflict"; message: string }
  | { job: ParseJobRecord; kind: "retried" }
  | { kind: "not_found" };

export type ManualReparseResult =
  | { job: ParseJobRecord; kind: "created" }
  | { kind: "not_found" };

export class PgIngestRepository {
  public constructor(private readonly pool: Pool) {}

  public async claimPendingStagingRecords(
    batchSize: number,
  ): Promise<IngestStagingRecord[]> {
    const result = await this.pool.query<StagingRow>(
      `
        with claimed as (
          select id
          from ingest_staging_records
          where status = 'pending'
          order by created_at, id
          limit $1
          for update skip locked
        )
        update ingest_staging_records
        set status = 'processing',
            updated_at = now()
        from claimed
        where ingest_staging_records.id = claimed.id
        returning ingest_staging_records.*
      `,
      [batchSize],
    );

    return result.rows.map((row) => mapStagingRow(row));
  }

  public async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const value = await callback(client);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findReplayBySource(
    client: PoolClient,
    record: IngestStagingRecord,
  ): Promise<ReplayRecord | null> {
    const result = await client.query<ReplayRow>(
      "select * from replays where source_system = $1 and source_replay_id = $2",
      [record.sourceSystem, record.sourceReplayId],
    );
    return result.rows[0] === undefined ? null : mapReplayRow(result.rows[0]);
  }

  public async findReplayByChecksum(
    client: PoolClient,
    checksum: string,
  ): Promise<ReplayRecord | null> {
    const result = await client.query<ReplayRow>(
      "select * from replays where checksum = $1",
      [checksum],
    );
    return result.rows[0] === undefined ? null : mapReplayRow(result.rows[0]);
  }

  public async createReplay(
    client: PoolClient,
    record: IngestStagingRecord,
  ): Promise<ReplayRecord> {
    const result = await client.query<ReplayRow>(
      `
        insert into replays (
          source_system, source_replay_id, object_key, checksum, size_bytes,
          replay_timestamp, promotion_evidence, promoted_from_staging_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning *
      `,
      [
        record.sourceSystem,
        record.sourceReplayId,
        record.objectKey,
        record.checksum,
        record.sizeBytes,
        record.replayTimestamp,
        record.promotionEvidence,
        record.id,
      ],
    );
    return mapReplayRow(requiredRow(result.rows));
  }

  public async appendReplayEvidence(
    client: PoolClient,
    replay: ReplayRecord,
    record: IngestStagingRecord,
  ): Promise<void> {
    await client.query(
      `
        update replays
        set promotion_evidence = promotion_evidence || $2::jsonb,
            updated_at = now()
        where id = $1
      `,
      [
        replay.id,
        JSON.stringify({ duplicate_sources: [recordEvidence(record)] }),
      ],
    );
  }

  public async createParseJob(
    client: PoolClient,
    replay: ReplayRecord,
    parserContractVersion: string,
  ): Promise<ParseJobRecord> {
    const result = await client.query<ParseJobRow>(
      `
        insert into parse_jobs (replay_id, parser_contract_version, object_key, checksum)
        values ($1, $2, $3, $4)
        returning *
      `,
      [replay.id, parserContractVersion, replay.objectKey, replay.checksum],
    );
    const job = mapParseJobRow(requiredRow(result.rows));
    await recordParseJobHistory(client, {
      action: "created",
      details: { replay_id: replay.id },
      jobId: job.id,
      statusFrom: null,
      statusTo: job.status,
    });
    return job;
  }

  public async markStagingPromoted(
    client: PoolClient,
    stagingId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await updateStagingStatus(client, stagingId, "promoted", evidence, {});
  }

  public async markStagingConflicted(
    client: PoolClient,
    stagingId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await updateStagingStatus(client, stagingId, "conflicted", {}, details);
  }

  public async markStagingFailed(
    client: PoolClient,
    stagingId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await updateStagingStatus(client, stagingId, "failed", {}, details);
  }

  public async listPublishableJobs(limit: number): Promise<ParseJobRecord[]> {
    const result = await this.pool.query<ParseJobRow>(
      `
        select *
        from parse_jobs
        where status in ('queued', 'retryable')
        order by created_at, id
        limit $1
      `,
      [limit],
    );
    return result.rows.map((row) => mapParseJobRow(row));
  }

  public async markJobPublished(jobId: string): Promise<void> {
    await this.withTransaction(async (client) => {
      const job = await lockJob(client, jobId);
      if (job === null) {
        return;
      }
      await client.query(
        `
          update parse_jobs
          set status = 'published',
              attempts = attempts + 1,
              published_at = now(),
              error = null,
              updated_at = now()
          where id = $1
        `,
        [jobId],
      );
      await recordParseJobHistory(client, {
        action: "published",
        details: {},
        jobId,
        statusFrom: job.status,
        statusTo: "published",
      });
    });
  }

  public async markJobPublishFailed(
    jobId: string,
    error: Record<string, unknown>,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      const job = await lockJob(client, jobId);
      if (job === null) {
        return;
      }
      await client.query(
        `
          update parse_jobs
          set status = 'retryable',
              attempts = attempts + 1,
              error = $2,
              updated_at = now()
          where id = $1
        `,
        [jobId, error],
      );
      await recordParseJobHistory(client, {
        action: "publish_failed",
        details: { error },
        jobId,
        statusFrom: job.status,
        statusTo: "retryable",
      });
    });
  }

  public async retryParseJob(
    jobId: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ): Promise<ParseJobRetryResult> {
    return this.withTransaction(async (client) => {
      const job = await lockJob(client, jobId);
      if (job === null) {
        return { kind: "not_found" };
      }
      if (job.status !== "failed" && job.status !== "retryable") {
        return {
          kind: "conflict",
          message: "only failed or retryable parse jobs can be retried",
        };
      }
      const result = await client.query<ParseJobRow>(
        `
          update parse_jobs
          set status = 'queued',
              published_at = null,
              started_at = null,
              finished_at = null,
              error = null,
              updated_at = now()
          where id = $1
          returning *
        `,
        [jobId],
      );
      const retried = mapParseJobRow(requiredRow(result.rows));
      await recordParseJobHistory(client, {
        action: "retried",
        actorUserId,
        details,
        jobId,
        statusFrom: job.status,
        statusTo: retried.status,
      });
      return { job: retried, kind: "retried" };
    });
  }

  public async createManualReparse(
    replayId: string,
    parserContractVersion: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ): Promise<ManualReparseResult> {
    return this.withTransaction(async (client) => {
      const replayResult = await client.query<ReplayRow>(
        "select * from replays where id = $1 for update",
        [replayId],
      );
      const [replay] = replayResult.rows;
      if (replay === undefined) {
        return { kind: "not_found" };
      }
      const jobResult = await client.query<ParseJobRow>(
        `
          insert into parse_jobs (replay_id, parser_contract_version, object_key, checksum)
          values ($1, $2, $3, $4)
          returning *
        `,
        [replay.id, parserContractVersion, replay.object_key, replay.checksum],
      );
      const job = mapParseJobRow(requiredRow(jobResult.rows));
      await client.query(
        `
          update replays
          set status = 'ready_for_parse',
              updated_at = now()
          where id = $1
        `,
        [replayId],
      );
      await recordParseJobHistory(client, {
        action: "manual_reparse",
        actorUserId,
        details: {
          ...details,
          parser_contract_version: parserContractVersion,
          replay_status_from: replay.status,
        },
        jobId: job.id,
        statusFrom: null,
        statusTo: job.status,
      });
      return { job, kind: "created" };
    });
  }

  public async listParseJobHistory(
    jobId: string,
  ): Promise<ParseJobHistoryEntry[]> {
    const result = await this.pool.query<ParseJobHistoryRow>(
      `
        select *
        from parse_job_history
        where job_id = $1
        order by created_at, id
      `,
      [jobId],
    );
    return result.rows.map((row) => mapParseJobHistoryRow(row));
  }

  public async listStagingRecords(
    filters: StagingFilters,
    page: PageQuery,
  ): Promise<PageResult<IngestStagingRecord>> {
    const query = buildStagingWhere(filters),
      rows = await this.pool.query<StagingRow>(stagingListSql(query.where), [
        ...query.values,
        page.pageSize,
        offset(page),
      ]),
      total = await this.pool.query<{ count: string }>(
        `select count(*) from ingest_staging_records ${query.where}`,
        query.values,
      );
    return toPage(
      rows.rows.map((row) => mapStagingRow(row)),
      page,
      total.rows[0]?.count,
    );
  }

  public async getStagingRecord(
    id: string,
  ): Promise<IngestStagingRecord | null> {
    const result = await this.pool.query<StagingRow>(
      "select * from ingest_staging_records where id = $1",
      [id],
    );
    return result.rows[0] === undefined ? null : mapStagingRow(result.rows[0]);
  }

  public async listParseJobs(
    filters: ParseJobFilters,
    page: PageQuery,
  ): Promise<PageResult<ParseJobRecord>> {
    const query = buildParseJobWhere(filters),
      rows = await this.pool.query<ParseJobRow>(parseJobListSql(query.where), [
        ...query.values,
        page.pageSize,
        offset(page),
      ]),
      total = await this.pool.query<{ count: string }>(
        `select count(*) from parse_jobs ${query.where}`,
        query.values,
      );
    return toPage(
      rows.rows.map((row) => mapParseJobRow(row)),
      page,
      total.rows[0]?.count,
    );
  }

  public async getParseJob(id: string): Promise<ParseJobRecord | null> {
    const result = await this.pool.query<ParseJobRow>(
      "select * from parse_jobs where id = $1",
      [id],
    );
    return result.rows[0] === undefined ? null : mapParseJobRow(result.rows[0]);
  }

  public async recordParserCompleted(message: {
    artifact: { bucket: string; key: string };
    artifact_checksum: { algorithm: "sha256"; value: string };
    artifact_size_bytes: number;
    job_id: string;
    parser_contract_version: string;
    parser?: { name: string; version: string };
    replay_id: string;
    source_checksum: { algorithm: "sha256"; value: string };
  }): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const job = await lockJob(client, message.job_id);
      if (job === null || isTerminal(job.status)) {
        return false;
      }
      await client.query(
        `
          update parse_jobs
          set status = 'succeeded',
              finished_at = now(),
              error = null,
              updated_at = now()
          where id = $1
        `,
        [message.job_id],
      );
      await client.query(
        `
          update replays
          set status = 'parsed',
              updated_at = now()
          where id = $1
        `,
        [message.replay_id],
      );
      await client.query(
        `
          update parser_results
          set status = 'superseded'
          where replay_id = $1 and status = 'current'
        `,
        [message.replay_id],
      );
      await client.query(
        `
          insert into parser_results (
            replay_id, parse_job_id, parser_contract_version, status, raw_snapshot
          )
          values ($1, $2, $3, 'current', $4)
        `,
        [
          message.replay_id,
          message.job_id,
          message.parser_contract_version,
          {
            artifact: message.artifact,
            artifact_checksum: message.artifact_checksum,
            artifact_size_bytes: message.artifact_size_bytes,
            parser: message.parser,
            source_checksum: message.source_checksum,
          },
        ],
      );
      await recordParseJobHistory(client, {
        action: "parser_completed",
        details: {
          artifact: message.artifact,
          parser_contract_version: message.parser_contract_version,
        },
        jobId: message.job_id,
        statusFrom: job.status,
        statusTo: "succeeded",
      });
      return true;
    });
  }

  public async recordParserFailed(message: {
    failure: {
      error_code: string;
      message: string;
      retryability: "retryable" | "not_retryable";
      stage: string;
    };
    job_id: { state: "present"; value: string };
    parser?: { name: string; version: string };
    parser_contract_version: { state: "present"; value: string };
    replay_id: { state: "present"; value: string };
  }): Promise<boolean> {
    return this.withTransaction(async (client) => {
      const job = await lockJob(client, message.job_id.value);
      if (job === null || isTerminal(job.status)) {
        return false;
      }
      const retryable = message.failure.retryability === "retryable",
        status = retryable ? "retryable" : "failed";
      await client.query(
        `
          update parse_jobs
          set status = $2,
              finished_at = now(),
              error = $3,
              updated_at = now()
          where id = $1
        `,
        [
          message.job_id.value,
          status,
          {
            failure: message.failure,
            parser: message.parser,
            parser_contract_version: message.parser_contract_version.value,
          },
        ],
      );
      if (!retryable) {
        await client.query(
          `
            update replays
            set status = 'parse_failed',
                updated_at = now()
            where id = $1
          `,
          [message.replay_id.value],
        );
      }
      await recordParseJobHistory(client, {
        action: "parser_failed",
        details: {
          failure: message.failure,
          parser: message.parser,
          parser_contract_version: message.parser_contract_version.value,
        },
        jobId: message.job_id.value,
        statusFrom: job.status,
        statusTo: status,
      });
      return true;
    });
  }
}

function buildStagingWhere(filters: StagingFilters): SqlWhere {
  return buildWhere([
    ["status", filters.status],
    ["source_system", filters.sourceSystem],
    ["source_replay_id", filters.sourceReplayId],
    ["checksum", filters.checksum],
  ]);
}

function buildParseJobWhere(filters: ParseJobFilters): SqlWhere {
  return buildWhere([
    ["status", filters.status],
    ["id", filters.jobId],
    ["replay_id", filters.replayId],
    ["checksum", filters.checksum],
  ]);
}

interface SqlWhere {
  where: string;
  values: string[];
}

function buildWhere(pairs: [string, string | undefined][]): SqlWhere {
  const clauses: string[] = [],
    values: string[] = [];
  for (const [column, value] of pairs) {
    if (value === undefined) {
      continue;
    }
    values.push(value);
    clauses.push(`${column} = $${String(values.length)}`);
  }
  return {
    values,
    where: clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`,
  };
}

function stagingListSql(where: string): string {
  const next = nextParameter(where);
  return `
    select *
    from ingest_staging_records
    ${where}
    order by created_at desc, id desc
    limit $${String(next)} offset $${String(next + 1)}
  `;
}

function parseJobListSql(where: string): string {
  const next = nextParameter(where);
  return `
    select *
    from parse_jobs
    ${where}
    order by created_at desc, id desc
    limit $${String(next)} offset $${String(next + 1)}
  `;
}

function nextParameter(where: string): number {
  const matches = [...where.matchAll(/\$\d+/gu)].map((match) =>
    Number(match[0].slice(1)),
  );
  return matches.length === 0 ? 1 : Math.max(...matches) + 1;
}

async function updateStagingStatus(
  client: PoolClient,
  stagingId: string,
  status: IngestStagingRecord["status"],
  promotionEvidence: Record<string, unknown>,
  conflictDetails: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `
      update ingest_staging_records
      set status = $2,
          promotion_evidence = promotion_evidence || $3::jsonb,
          conflict_details = conflict_details || $4::jsonb,
          updated_at = now()
      where id = $1
    `,
    [
      stagingId,
      status,
      JSON.stringify(promotionEvidence),
      JSON.stringify(conflictDetails),
    ],
  );
}

function mapStagingRow(row: StagingRow): IngestStagingRecord {
  return {
    checksum: row.checksum,
    conflictDetails: row.conflict_details,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    objectKey: row.object_key,
    promotionEvidence: row.promotion_evidence,
    replayTimestamp: row.replay_timestamp?.toISOString() ?? null,
    sizeBytes: Number(row.size_bytes),
    sourceReplayId: row.source_replay_id,
    sourceSystem: row.source_system,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapReplayRow(row: ReplayRow): ReplayRecord {
  return {
    checksum: row.checksum,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    objectKey: row.object_key,
    promotedFromStagingId: row.promoted_from_staging_id,
    promotionEvidence: row.promotion_evidence,
    replayTimestamp: row.replay_timestamp?.toISOString() ?? null,
    sizeBytes: Number(row.size_bytes),
    sourceReplayId: row.source_replay_id,
    sourceSystem: row.source_system,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapParseJobRow(row: ParseJobRow): ParseJobRecord {
  return {
    attempts: row.attempts,
    checksum: row.checksum,
    createdAt: row.created_at.toISOString(),
    error: row.error,
    finishedAt: row.finished_at?.toISOString() ?? null,
    id: row.id,
    objectKey: row.object_key,
    parserContractVersion: row.parser_contract_version,
    publishedAt: row.published_at?.toISOString() ?? null,
    replayId: row.replay_id,
    startedAt: row.started_at?.toISOString() ?? null,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapParseJobHistoryRow(row: ParseJobHistoryRow): ParseJobHistoryEntry {
  return {
    action: row.action,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at.toISOString(),
    details: row.details,
    id: row.id,
    jobId: row.job_id,
    statusFrom: row.status_from,
    statusTo: row.status_to,
  };
}

interface RecordHistoryInput {
  action: ParseJobHistoryEntry["action"];
  actorUserId?: string;
  details: Record<string, unknown>;
  jobId: string;
  statusFrom: ParseJobHistoryEntry["statusFrom"];
  statusTo: ParseJobHistoryEntry["statusTo"];
}

async function recordParseJobHistory(
  client: PoolClient,
  input: RecordHistoryInput,
): Promise<void> {
  await client.query(
    `
      insert into parse_job_history (
        job_id, action, status_from, status_to, actor_user_id, details
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.jobId,
      input.action,
      input.statusFrom,
      input.statusTo,
      input.actorUserId ?? null,
      input.details,
    ],
  );
}

function recordEvidence(record: IngestStagingRecord): Record<string, unknown> {
  return {
    checksum: record.checksum,
    object_key: record.objectKey,
    size_bytes: record.sizeBytes,
    source_replay_id: record.sourceReplayId,
    source_system: record.sourceSystem,
    staging_id: record.id,
  };
}

function requiredRow<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("expected query to return a row");
  }
  return row;
}

function offset(page: PageQuery): number {
  return (page.page - 1) * page.pageSize;
}

function toPage<T>(
  items: T[],
  page: PageQuery,
  total: string | undefined,
): PageResult<T> {
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    total: Number(total),
  };
}

async function lockJob(
  client: PoolClient,
  jobId: string,
): Promise<ParseJobRow | null> {
  const result = await client.query<ParseJobRow>(
    "select * from parse_jobs where id = $1 for update",
    [jobId],
  );
  return result.rows[0] ?? null;
}

function isTerminal(status: ParseJobRecord["status"]): boolean {
  return status === "succeeded" || status === "failed";
}
