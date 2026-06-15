/* eslint-disable @typescript-eslint/unbound-method, camelcase, no-magic-numbers, unicorn/no-null */
import { describe, expect, it, vi } from "vitest";

import {
  ParseJobReconciler,
  type ParseJobReconcilerObserver,
  type ParseJobReconcilerRepository,
} from "./reconciler.js";

import type { ParseJobRecord } from "./types.js";

describe("ParseJobReconciler", () => {
  it("reclaims stale published jobs, notifies the observer, and logs each one", async () => {
    const jobs = [parseJob("job-1"), parseJob("job-2")],
      repository: ParseJobReconcilerRepository = {
        reclaimStalePublishedJobs: vi.fn(async () => jobs),
      },
      observer = observerDouble(),
      logger = { error: vi.fn(), info: vi.fn() },
      reconciler = new ParseJobReconciler(repository, { logger, observer }),
      reclaimed = await reconciler.reconcileStale({
        batchSize: 25,
        staleAfterMs: 3_600_000,
      });

    expect(repository.reclaimStalePublishedJobs).toHaveBeenCalledWith(
      3_600_000,
      25,
    );
    expect(reclaimed).toBe(jobs);
    expect(observer.jobReconciled).toHaveBeenCalledTimes(2);
    expect(observer.jobReconciled).toHaveBeenCalledWith(jobs[0]);
    expect(observer.jobReconciled).toHaveBeenCalledWith(jobs[1]);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-1" }),
      "parse job reconciled",
    );
  });

  it("does nothing per-job when the repository returns no stale jobs", async () => {
    const repository: ParseJobReconcilerRepository = {
        reclaimStalePublishedJobs: vi.fn(async () => []),
      },
      observer = observerDouble(),
      logger = { error: vi.fn(), info: vi.fn() },
      reconciler = new ParseJobReconciler(repository, { logger, observer }),
      reclaimed = await reconciler.reconcileStale({
        batchSize: 10,
        staleAfterMs: 1000,
      });

    expect(reclaimed).toEqual([]);
    expect(observer.jobReconciled).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("uses noop observer/logger defaults when runtime options are omitted", async () => {
    const jobs = [parseJob("job-3")],
      repository: ParseJobReconcilerRepository = {
        reclaimStalePublishedJobs: vi.fn(async () => jobs),
      },
      reconciler = new ParseJobReconciler(repository),
      reclaimed = await reconciler.reconcileStale({
        batchSize: 5,
        staleAfterMs: 500,
      });

    expect(reclaimed).toBe(jobs);
    expect(repository.reclaimStalePublishedJobs).toHaveBeenCalledWith(500, 5);
  });
});

function observerDouble(): ParseJobReconcilerObserver {
  return { jobReconciled: vi.fn() };
}

function parseJob(id: string): ParseJobRecord {
  return {
    attempts: 1,
    checksum: "a".repeat(64),
    createdAt: "2026-05-09T00:00:00.000Z",
    error: null,
    finishedAt: null,
    id,
    objectKey: `raw/${id}.ocap.json`,
    parserContractVersion: "3.0.0",
    publishedAt: "2026-05-09T00:00:00.000Z",
    replayId: `replay-${id}`,
    startedAt: null,
    status: "queued",
    updatedAt: "2026-05-09T00:00:00.000Z",
  };
}
