import { describe, expect, it } from "vitest";

import { loadConfig } from "../../config/env.js";
import { createDbClient } from "../../infra/db/client.js";
import { createQueueClient } from "../../infra/queue/client.js";
import { createStorageClient } from "../../infra/storage/client.js";

const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://solid:solid@localhost:15432/solid_stats",
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? "amqp://solid:solid@localhost:5673",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_BUCKET: process.env.S3_BUCKET ?? "solid-replays",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "solid",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "solidsecret",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE ?? "true",
};

describe("dependency adapters", () => {
  it("checks PostgreSQL, RabbitMQ, and S3-compatible storage", async () => {
    const config = loadConfig(env);
    const db = createDbClient(config);
    const queue = createQueueClient(config);
    const storage = createStorageClient(config);

    try {
      await expect(db.check()).resolves.toMatchObject({ status: "ok" });
      await expect(queue.check()).resolves.toMatchObject({ status: "ok" });
      await expect(storage.check()).resolves.toMatchObject({ status: "ok" });
    } finally {
      await Promise.all([db.close(), queue.close(), storage.close()]);
    }
  });
});
