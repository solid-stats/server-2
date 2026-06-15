/* eslint-disable @typescript-eslint/no-unsafe-assignment, camelcase */
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { expect, it, vi } from "vitest";

import { createStorageClient } from "./client.js";

import type { AppConfig } from "../../config/env.js";

const awsMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: function GetObjectCommand(input: unknown) {
    return { input };
  },
  HeadBucketCommand: function HeadBucketCommand(input: unknown) {
    return { input };
  },
  PutObjectCommand: function PutObjectCommand(input: unknown) {
    return { input };
  },
  S3Client: function S3Client() {
    return {
      destroy: awsMocks.destroy,
      send: awsMocks.send,
    };
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://storage.example.test/upload"),
}));

const config: AppConfig = {
  auth: {
    bootstrapAdminSteamId: "",
    publicBaseUrl: "http://localhost:3000",
    sessionCookieName: "solid_stats_session",
    sessionTtlSeconds: 60,
  },
  databaseUrl: "postgres://localhost/solid",
  env: "test",
  host: "127.0.0.1",
  ingest: {
    parserContractVersion: "3.0.0",
    pollIntervalMs: 5000,
    promotionBatchSize: 25,
    publishBatchSize: 25,
    reconcileBatchSize: 25,
    staleAfterMs: 3_600_000,
  },
  logLevel: "silent",
  port: 3000,
  rabbitmqUrl: "amqp://localhost",
  s3: {
    accessKeyId: "solid",
    bucket: "solid-replays",
    endpoint: "http://localhost:9000",
    forcePathStyle: true,
    region: "us-east-1",
    secretAccessKey: "solidsecret",
  },
};

it("createStorageClient should check bucket health and close the client", async () => {
  const storage = createStorageClient(config);

  await expect(storage.check()).resolves.toEqual({ status: "ok" });
  await storage.close();

  expect(awsMocks.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ input: { Bucket: "solid-replays" } }),
  );
  expect(awsMocks.destroy).toHaveBeenCalledExactlyOnceWith();
});

it("createStorageClient should create presigned request attachment uploads", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-05-09T17:00:00.000Z"));
    const storage = createStorageClient(config);

    const upload = await storage.createUpload({
      contentType: "image/png",
      fileName: "bad name.png",
      requestId: "request-1",
      sizeBytes: 128,
    });

    expect(upload).toMatchObject({
      expiresAt: "2026-05-09T17:15:00.000Z",
      headers: { "content-type": "image/png" },
      uploadUrl: "https://storage.example.test/upload",
    });
    expect(upload.objectKey).toContain("attachments/request-1/");
    expect(upload.objectKey).toContain("bad_name.png");
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "solid-replays",
          ContentLength: 128,
          ContentType: "image/png",
          Key: upload.objectKey,
        }),
      }),
      { expiresIn: 900 },
    );
  } finally {
    vi.useRealTimers();
  }
});

it("createStorageClient should load parser artifacts from object storage", async () => {
  awsMocks.send.mockResolvedValueOnce({
    Body: {
      transformToString: vi.fn(async () =>
        JSON.stringify({
          contract_version: "3.0.0",
          parser: {},
          source: {},
          status: "success",
        }),
      ),
    },
  });
  const storage = createStorageClient(config);

  await expect(
    storage.loadParserArtifact({
      bucket: "parser-artifacts",
      key: "artifacts/result.json",
    }),
  ).resolves.toMatchObject({
    contract_version: "3.0.0",
    status: "success",
  });
  expect(awsMocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      input: {
        Bucket: "parser-artifacts",
        Key: "artifacts/result.json",
      },
    }),
  );
});

it("createStorageClient should reject empty parser artifact objects", async () => {
  awsMocks.send.mockResolvedValueOnce({});
  const storage = createStorageClient(config);

  await expect(
    storage.loadParserArtifact({ key: "artifacts/empty.json" }),
  ).rejects.toThrow("has no body");
});
