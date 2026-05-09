import { describe, expect, it } from "vitest";

import { loadConfig, redactConfigForLogs } from "./env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://solid:solid@localhost:5432/solid_stats",
  RABBITMQ_URL: "amqp://solid:solid@localhost:5672",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "solid-replays",
  S3_ACCESS_KEY_ID: "solid",
  S3_SECRET_ACCESS_KEY: "solidsecret"
};

describe("loadConfig", () => {
  it("loads defaults and required service settings", () => {
    const config = loadConfig(baseEnv);

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
    expect(config.s3.forcePathStyle).toBe(true);
    expect(config.s3.bucket).toBe("solid-replays");
  });

  it("redacts credential-bearing values", () => {
    const redacted = JSON.stringify(redactConfigForLogs(loadConfig(baseEnv)));

    expect(redacted).not.toContain("solidsecret");
    expect(redacted).not.toContain("solid:solid");
    expect(redacted).not.toContain("postgresql://solid:solid@");
    expect(redacted).toContain("redacted");
  });
});
