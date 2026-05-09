export type IngestStatus =
  | "pending"
  | "processing"
  | "promoted"
  | "conflicted"
  | "failed"
  | "ignored";

export type ParseJobStatus =
  | "queued"
  | "published"
  | "running"
  | "succeeded"
  | "failed"
  | "retryable";

export interface IngestStagingRecord {
  id: string;
  sourceSystem: string;
  sourceReplayId: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  replayTimestamp: string | null;
  status: IngestStatus;
  promotionEvidence: Record<string, unknown>;
  conflictDetails: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayRecord {
  id: string;
  sourceSystem: string;
  sourceReplayId: string;
  objectKey: string;
  checksum: string;
  sizeBytes: number;
  replayTimestamp: string | null;
  status: string;
  promotionEvidence: Record<string, unknown>;
  promotedFromStagingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParseJobRecord {
  id: string;
  replayId: string;
  parserContractVersion: string;
  objectKey: string;
  checksum: string;
  status: ParseJobStatus;
  attempts: number;
  publishedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionOptions {
  batchSize: number;
  parserContractVersion: string;
}

export type PromotionStatus =
  | "promoted"
  | "duplicate"
  | "conflicted"
  | "failed";

export interface PromotionResult {
  stagingId: string;
  status: PromotionStatus;
  replayId?: string;
  parseJobId?: string;
  reason?: string;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StagingFilters {
  status?: IngestStatus;
  replayId?: string;
  sourceSystem?: string;
  sourceReplayId?: string;
  checksum?: string;
}

export interface ParseJobFilters {
  status?: ParseJobStatus;
  jobId?: string;
  replayId?: string;
  checksum?: string;
}
