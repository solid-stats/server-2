/* eslint-disable max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../auth/routes/memory.js";
import {
  authCookieName,
  FakeSteamOpenIdAdapter,
  steamId,
} from "../../../auth/routes/tests/fixtures.js";

import type { ParseJobRecord } from "../../types.js";
import type {
  IngestCommandModel,
  ManualReparseResult,
  RetryParseJobResult,
} from "../routes.js";

const FORBIDDEN = 403,
  NOT_FOUND = 404,
  UNAUTHORIZED = 401,
  job: ParseJobRecord = {
    attempts: 1,
    checksum: "a".repeat(64),
    createdAt: "2026-05-09T00:00:00.000Z",
    error: { message: "failed" },
    finishedAt: "2026-05-09T00:02:00.000Z",
    id: "00000000-0000-4000-8000-000000000201",
    objectKey: "raw/replay-1.ocap.json",
    parserContractVersion: "3.0.0",
    publishedAt: "2026-05-09T00:01:00.000Z",
    replayId: "00000000-0000-4000-8000-000000000101",
    startedAt: null,
    status: "queued",
    updatedAt: "2026-05-09T00:03:00.000Z",
  };

describe("ingest operator action routes", () => {
  it("retries parse jobs through an admin-only operation", async () => {
    const commands = new FakeCommands(),
      app = await buildActionsApp(commands);

    try {
      const adminCookie = await loginCookie(app);

      const response = await app.inject({
        body: { reason: "broker recovered" },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/operations/parse-jobs/${job.id}/retry`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: job.id, status: "queued" });
      expect(commands.retryInput).toMatchObject({
        jobId: job.id,
        reason: "broker recovered",
      });
    } finally {
      await app.close();
    }
  });

  it("creates manual reparses through an admin-only operation", async () => {
    const commands = new FakeCommands(),
      app = await buildActionsApp(commands);

    try {
      const adminCookie = await loginCookie(app);

      const response = await app.inject({
        body: { parserContractVersion: "3.0.1", reason: "parser fix" },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/operations/replays/${job.replayId}/reparse`,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ replayId: job.replayId });
      expect(commands.reparseInput).toMatchObject({
        parserContractVersion: "3.0.1",
        reason: "parser fix",
        replayId: job.replayId,
      });
    } finally {
      await app.close();
    }
  });

  it("returns operation errors for missing or non-retryable records", async () => {
    const commands = new FakeCommands(),
      app = await buildActionsApp(commands),
      adminCookie = await loginCookie(app);

    try {
      commands.retryResult = {
        kind: "conflict",
        message: "only failed or retryable parse jobs can be retried",
      };
      const conflict = await app.inject({
        body: {},
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/operations/parse-jobs/${job.id}/retry`,
      });

      commands.reparseResult = { kind: "not_found" };
      const missingReplay = await app.inject({
        body: { parserContractVersion: "3.0.1" },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/operations/replays/${job.replayId}/reparse`,
      });

      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toEqual({
        message: "only failed or retryable parse jobs can be retried",
      });
      expect(missingReplay.statusCode).toBe(NOT_FOUND);
      expect(missingReplay.json()).toEqual({ message: "replay not found" });
    } finally {
      await app.close();
    }
  });

  it("rejects parse job operations for anonymous and non-admin users", async () => {
    const app = await buildActionsApp(new FakeCommands(), false);

    try {
      const anonymous = await app.inject({
          body: {},
          method: "POST",
          url: `/operations/parse-jobs/${job.id}/retry`,
        }),
        userCookie = await loginCookie(app),
        forbidden = await app.inject({
          body: {},
          headers: { cookie: userCookie },
          method: "POST",
          url: `/operations/parse-jobs/${job.id}/retry`,
        });

      expect(anonymous.statusCode).toBe(UNAUTHORIZED);
      expect(anonymous.json()).toEqual({ message: "authentication required" });
      expect(forbidden.statusCode).toBe(FORBIDDEN);
      expect(forbidden.json()).toEqual({ message: "required role missing" });
    } finally {
      await app.close();
    }
  });

  it("returns not found from default operation commands", async () => {
    const app = await buildActionsApp();

    try {
      const adminCookie = await loginCookie(app);

      const retry = await app.inject({
          body: {},
          headers: { cookie: adminCookie },
          method: "POST",
          url: `/operations/parse-jobs/${job.id}/retry`,
        }),
        reparse = await app.inject({
          body: { parserContractVersion: "3.0.1" },
          headers: { cookie: adminCookie },
          method: "POST",
          url: `/operations/replays/${job.replayId}/reparse`,
        });

      expect(retry.statusCode).toBe(NOT_FOUND);
      expect(retry.json()).toEqual({ message: "parse job not found" });
      expect(reparse.statusCode).toBe(NOT_FOUND);
      expect(reparse.json()).toEqual({ message: "replay not found" });
    } finally {
      await app.close();
    }
  });
});

class FakeCommands implements IngestCommandModel {
  public reparseInput:
    | {
        actorUserId: string;
        parserContractVersion: string;
        reason?: string;
        replayId: string;
      }
    | undefined;

  public reparseResult: ManualReparseResult = { job, kind: "created" };

  public retryInput:
    | {
        actorUserId: string;
        jobId: string;
        reason?: string;
      }
    | undefined;

  public retryResult: RetryParseJobResult = { job, kind: "retried" };

  public createManualReparse(input: {
    actorUserId: string;
    parserContractVersion: string;
    reason?: string;
    replayId: string;
  }): Promise<ManualReparseResult> {
    this.reparseInput = input;
    return Promise.resolve(this.reparseResult);
  }

  public retryParseJob(input: {
    actorUserId: string;
    jobId: string;
    reason?: string;
  }): Promise<RetryParseJobResult> {
    this.retryInput = input;
    return Promise.resolve(this.retryResult);
  }
}

async function buildActionsApp(
  commands?: IngestCommandModel,
  bootstrapAdmin = true,
) {
  const steam = new FakeSteamOpenIdAdapter();
  return buildApp({
    auth: {
      cookie: {
        name: authCookieName,
        ttlSeconds: 60,
      },
      publicBaseUrl: "http://localhost:3000",
      sessions: new InMemorySessionStore(),
      steam,
      users: new InMemoryAuthUserRepository(bootstrapAdmin ? steamId : ""),
    },
    ...(commands === undefined ? {} : { ingestCommands: commands }),
  });
}

async function loginCookie(app: Awaited<ReturnType<typeof buildActionsApp>>) {
  const callback = await app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    cookie = requireCookie(callback.cookies);
  return `${cookie.name}=${cookie.value}`;
}

function requireCookie(cookies: { name: string; value: string }[]) {
  const [cookie] = cookies;
  if (cookie === undefined) {
    throw new Error("Expected auth response to set a session cookie.");
  }
  return cookie;
}
