import { expect, test } from "vitest";

import { buildApp } from "../app.js";
import { createStaticHealthCheck } from "../infra/health.js";
import { createLoggerOptions } from "../infra/logging/logger.js";

test("buildApp should serve liveness when the application is built", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: "GET", url: "/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  } finally {
    await app.close();
  }
});

test("buildApp should serve readiness, metrics, and OpenAPI when dependencies are healthy", async () => {
  const app = await buildApp();

  try {
    const ready = await app.inject({ method: "GET", url: "/ready" });
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    const openapi = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("server2_process_cpu_user_seconds_total");
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "server-2" },
    });
  } finally {
    await app.close();
  }
});

test("buildApp should report degraded readiness when a dependency check fails", async () => {
  const app = await buildApp({
    checks: {
      db: createStaticHealthCheck("error"),
      queue: createStaticHealthCheck(),
      storage: createStaticHealthCheck(),
    },
  });

  try {
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      checks: {
        db: { status: "error" },
      },
      status: "degraded",
    });
  } finally {
    await app.close();
  }
});

test("createLoggerOptions should build credential redaction paths when config is provided", () => {
  const logger = createLoggerOptions({
    databaseUrl: "postgresql://solid:solid@localhost:15432/solid_stats",
    env: "test",
    host: "127.0.0.1",
    logLevel: "debug",
    port: 3000,
    rabbitmqUrl: "amqp://solid:solid@localhost:5673",
    s3: {
      accessKeyId: "solid",
      bucket: "solid-replays",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
      region: "us-east-1",
      secretAccessKey: "solidsecret",
    },
  });

  expect(logger).toStrictEqual({
    level: "debug",
    redact: {
      censor: "redacted",
      paths: [
        "databaseUrl",
        "rabbitmqUrl",
        "s3.accessKeyId",
        "s3.secretAccessKey",
        "*.password",
        "*.secret",
      ],
    },
  });
});
