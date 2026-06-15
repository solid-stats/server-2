/* eslint-disable camelcase */
import type { ParseJobRecord } from "./types.js";

export interface ParseJobReconcilerRepository {
  reclaimStalePublishedJobs(
    staleAfterMs: number,
    batchSize: number,
  ): Promise<ParseJobRecord[]>;
}

export interface ParseJobReconcilerOptions {
  batchSize: number;
  staleAfterMs: number;
}

export interface ParseJobReconcilerObserver {
  jobReconciled(job: ParseJobRecord): void;
}

export interface ParseJobReconcilerLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export interface ParseJobReconcilerRuntimeOptions {
  logger?: ParseJobReconcilerLogger;
  observer?: ParseJobReconcilerObserver;
}

const noopObserver: ParseJobReconcilerObserver = {
    jobReconciled(job) {
      void job;
    },
  },
  noopLogger: ParseJobReconcilerLogger = {
    /* v8 ignore next 3 -- @preserve reconcileStale never logs errors; the noop error is a contract stub */
    error(bindings, message) {
      void bindings;
      void message;
    },
    info(bindings, message) {
      void bindings;
      void message;
    },
  };

export class ParseJobReconciler {
  private readonly logger: ParseJobReconcilerLogger;

  private readonly observer: ParseJobReconcilerObserver;

  public constructor(
    private readonly repository: ParseJobReconcilerRepository,
    runtimeOptions: ParseJobReconcilerRuntimeOptions = {},
  ) {
    this.logger = runtimeOptions.logger ?? noopLogger;
    this.observer = runtimeOptions.observer ?? noopObserver;
  }

  public async reconcileStale(
    options: ParseJobReconcilerOptions,
  ): Promise<ParseJobRecord[]> {
    const reclaimed = await this.repository.reclaimStalePublishedJobs(
      options.staleAfterMs,
      options.batchSize,
    );

    for (const job of reclaimed) {
      this.observer.jobReconciled(job);
      this.logger.info(parseJobLogBindings(job), "parse job reconciled");
    }

    return reclaimed;
  }
}

function parseJobLogBindings(job: ParseJobRecord): Record<string, unknown> {
  return {
    job_id: job.id,
    published_at: job.publishedAt,
    replay_id: job.replayId,
  };
}
