import { expect, test } from "vitest";

import { loadConfig, redactConfigForLogs } from "./env.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://solid:solid@localhost:5432/solid_stats",
  RABBITMQ_URL: "amqp://solid:solid@localhost:5672",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "solid-replays",
  S3_ACCESS_KEY_ID: "solid",
  S3_SECRET_ACCESS_KEY: "solidsecret",
};

test("loadConfig should load defaults and required service settings when valid environment is provided", () => {
  const config = loadConfig(baseEnvironment);

  expect(config.host).toBe("0.0.0.0");
  expect(config.port).toBe(3000);
  expect(config.logLevel).toBe("info");
  expect(config.s3.forcePathStyle).toBe(true);
  expect(config.s3.bucket).toBe("solid-replays");
});

test("redactConfigForLogs should redact credential-bearing values when configuration is logged", () => {
  const redacted = JSON.stringify(
    redactConfigForLogs(loadConfig(baseEnvironment)),
  );

  expect(redacted).not.toContain("solidsecret");
  expect(redacted).not.toContain("solid:solid");
  expect(redacted).not.toContain("postgresql://solid:solid@");
  expect(redacted).toContain("redacted");
});

test("redactConfigForLogs should redact malformed credential-bearing URLs when URL parsing fails", () => {
  const config = loadConfig(baseEnvironment),
    redacted = redactConfigForLogs({
      ...config,
      databaseUrl: "not a url",
    });

  expect(redacted["databaseUrl"]).toBe("redacted");
});

test("redactConfigForLogs should preserve credentialless URLs when no username or password exists", () => {
  const redacted = redactConfigForLogs({
    ...loadConfig(baseEnvironment),
    databaseUrl: "postgresql://localhost:5432/solid_stats",
    rabbitmqUrl: "amqp://localhost:5672",
  });

  expect(redacted["databaseUrl"]).toBe(
    "postgresql://localhost:5432/solid_stats",
  );
  expect(redacted["rabbitmqUrl"]).toBe("amqp://localhost:5672");
});

test("redactConfigForLogs should return an empty S3 credential when the source value is empty", () => {
  const redacted = redactConfigForLogs({
    ...loadConfig(baseEnvironment),
    s3: {
      ...loadConfig(baseEnvironment).s3,
      accessKeyId: "",
    },
  });

  expect(redacted).toMatchObject({
    s3: {
      accessKeyId: "",
      secretAccessKey: "redacted",
    },
  });
});
