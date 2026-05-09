/* eslint-disable class-methods-use-this, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

import type { IngestReadModel } from "./routes.js";
import type { IngestStagingRecord, ParseJobRecord } from "./types.js";

const staging: IngestStagingRecord = {
    checksum: "0".repeat(64),
    conflictDetails: {},
    createdAt: "2026-05-09T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    objectKey: "raw/replay-1.ocap.json",
    promotionEvidence: {},
    replayTimestamp: null,
    sizeBytes: 123,
    sourceReplayId: "replay-1",
    sourceSystem: "solidgames",
    status: "promoted",
    updatedAt: "2026-05-09T00:00:00.000Z",
  },
  job: ParseJobRecord = {
    attempts: 1,
    checksum: staging.checksum,
    createdAt: "2026-05-09T00:00:00.000Z",
    error: null,
    finishedAt: null,
    id: "00000000-0000-4000-8000-000000000201",
    objectKey: staging.objectKey,
    parserContractVersion: "3.0.0",
    publishedAt: "2026-05-09T00:01:00.000Z",
    replayId: "00000000-0000-4000-8000-000000000101",
    startedAt: null,
    status: "published",
    updatedAt: "2026-05-09T00:01:00.000Z",
  };

describe("ingest operator routes", () => {
  it("serves staging and parse job lists through injected read model", async () => {
    const readModel = new FakeReadModel(),
      app = await buildApp({ ingestReadModel: readModel });

    try {
      const stagingResponse = await app.inject({
          method: "GET",
          url: "/operations/ingest-staging?status=promoted&page=2&pageSize=10",
        }),
        jobsResponse = await app.inject({
          method: "GET",
          url: "/operations/parse-jobs?status=published",
        });

      expect(stagingResponse.statusCode).toBe(200);
      expect(stagingResponse.json()).toMatchObject({
        items: [{ id: staging.id, status: "promoted" }],
        page: 2,
        pageSize: 10,
        total: 1,
      });
      expect(jobsResponse.statusCode).toBe(200);
      expect(jobsResponse.json()).toMatchObject({
        items: [{ id: job.id, status: "published" }],
        total: 1,
      });
      expect(readModel.lastStagingFilters).toEqual({ status: "promoted" });
    } finally {
      await app.close();
    }
  });

  it("exports ingest operator paths through OpenAPI", async () => {
    const app = await buildApp({ ingestReadModel: new FakeReadModel() });

    try {
      const response = await app.inject({
          method: "GET",
          url: "/openapi.json",
        }),
        openapi: { paths: Record<string, unknown> } = response.json();

      expect(openapi.paths).toHaveProperty("/operations/ingest-staging");
      expect(openapi.paths).toHaveProperty("/operations/parse-jobs/{id}");
    } finally {
      await app.close();
    }
  });

  it("serves default empty lifecycle pages and detail misses", async () => {
    const app = await buildApp();

    try {
      const stagingList = await app.inject({
          method: "GET",
          url: "/operations/ingest-staging",
        }),
        stagingDetail = await app.inject({
          method: "GET",
          url: `/operations/ingest-staging/${staging.id}`,
        }),
        jobList = await app.inject({
          method: "GET",
          url: "/operations/parse-jobs",
        }),
        jobDetail = await app.inject({
          method: "GET",
          url: `/operations/parse-jobs/${job.id}`,
        });

      expect(stagingList.json()).toMatchObject({ items: [], total: 0 });
      expect(jobList.json()).toMatchObject({ items: [], total: 0 });
      expect(stagingDetail.statusCode).toBe(404);
      expect(jobDetail.statusCode).toBe(404);

      const explicitJobPage = await app.inject({
        method: "GET",
        url: "/operations/parse-jobs?page=3&pageSize=7",
      });
      expect(explicitJobPage.json()).toMatchObject({
        page: 3,
        pageSize: 7,
      });
    } finally {
      await app.close();
    }
  });

  it("serves staging and parse job detail hits", async () => {
    const app = await buildApp({ ingestReadModel: new FakeReadModel() });

    try {
      const stagingDetail = await app.inject({
          method: "GET",
          url: `/operations/ingest-staging/${staging.id}`,
        }),
        jobDetail = await app.inject({
          method: "GET",
          url: `/operations/parse-jobs/${job.id}`,
        });

      expect(stagingDetail.json()).toMatchObject({ id: staging.id });
      expect(jobDetail.json()).toMatchObject({ id: job.id });
    } finally {
      await app.close();
    }
  });
});

class FakeReadModel implements IngestReadModel {
  public lastStagingFilters: Record<string, unknown> | undefined;

  public getParseJob(id: string): Promise<ParseJobRecord | null> {
    return Promise.resolve(id === job.id ? job : null);
  }

  public getStagingRecord(id: string): Promise<IngestStagingRecord | null> {
    return Promise.resolve(id === staging.id ? staging : null);
  }

  public listParseJobs(): Promise<{
    items: ParseJobRecord[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    return Promise.resolve({
      items: [job],
      page: 1,
      pageSize: 25,
      total: 1,
    });
  }

  public listStagingRecords(
    filters: Record<string, unknown>,
    page: { page: number; pageSize: number },
  ): Promise<{
    items: IngestStagingRecord[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    this.lastStagingFilters = filters;
    return Promise.resolve({
      items: [staging],
      page: page.page,
      pageSize: page.pageSize,
      total: 1,
    });
  }
}
