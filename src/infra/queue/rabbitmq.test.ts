/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions, camelcase, max-params, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseCompletedQueue,
  parseCompletedRoutingKey,
  parseFailedQueue,
  parserExchange,
  parseRequestedQueue,
  parseRequestedRoutingKey,
} from "./messages.js";
import { createRabbitMqParserRuntime } from "./rabbitmq.js";

import type { AppConfig } from "../../config/env.js";
import type { ConsumeMessage } from "amqplib";

const mocks = vi.hoisted(() => {
  const publishChannel = {
      assertExchange: vi.fn(async () => {}),
      assertQueue: vi.fn(async () => {}),
      bindQueue: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      publish: vi.fn(),
    },
    consumeChannel = {
      ack: vi.fn(),
      assertExchange: vi.fn(async () => {}),
      assertQueue: vi.fn(async () => {}),
      bindQueue: vi.fn(async () => {}),
      cancel: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      consume: vi.fn(),
      nack: vi.fn(),
      prefetch: vi.fn(async () => {}),
    },
    connection = {
      close: vi.fn(async () => {}),
      createChannel: vi.fn(async () => consumeChannel),
      createConfirmChannel: vi.fn(async () => publishChannel),
    },
    connect = vi.fn(async () => connection);
  return {
    connect,
    connection,
    consumeChannel,
    publishChannel,
  };
});

vi.mock("amqplib", () => ({
  connect: mocks.connect,
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

describe("RabbitMQ parser runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishChannel.publish.mockImplementation(
      (_exchange, _routingKey, _buffer, _options, callback) => {
        callback(null, {});
        return true;
      },
    );
    mocks.consumeChannel.consume.mockImplementation(async (queue, callback) => {
      consumers.set(queue, callback);
      return { consumerTag: `${queue}-consumer` };
    });
    consumers.clear();
  });

  const consumers = new Map<string, (message: ConsumeMessage | null) => void>();

  it("asserts parser topology and publishes JSON messages with confirms", async () => {
    const runtime = await createRabbitMqParserRuntime(config),
      payload = {
        checksum: { algorithm: "sha256" as const, value: "a".repeat(64) },
        job_id: "job-1",
        object_key: "raw/replay.ocap.json",
        parser_contract_version: "3.0.0",
        replay_id: "replay-1",
      };

    await runtime.publishJson(parserExchange, "parse.requested", payload);

    expect(mocks.connect).toHaveBeenCalledWith(config.rabbitmqUrl);
    expectParserTopologyAssertions();
    expect(mocks.publishChannel.publish).toHaveBeenCalledWith(
      parserExchange,
      "parse.requested",
      Buffer.from(JSON.stringify(payload)),
      { contentType: "application/json", persistent: true },
      expect.any(Function),
    );
  });

  it("rejects publish confirm failures as Error objects", async () => {
    mocks.publishChannel.publish.mockImplementation(
      (_exchange, _routingKey, _buffer, _options, callback) => {
        callback("nope", {});
        return true;
      },
    );
    const runtime = await createRabbitMqParserRuntime(config);

    await expect(
      runtime.publishJson(parserExchange, "parse.requested", {
        checksum: { algorithm: "sha256", value: "a".repeat(64) },
        job_id: "job-1",
        object_key: "raw/replay.ocap.json",
        parser_contract_version: "3.0.0",
        replay_id: "replay-1",
      }),
    ).rejects.toThrow("RabbitMQ publish confirm failed");
  });

  it("preserves Error publish confirm failures", async () => {
    mocks.publishChannel.publish.mockImplementation(
      (_exchange, _routingKey, _buffer, _options, callback) => {
        callback(new Error("confirm failed"), {});
        return true;
      },
    );
    const runtime = await createRabbitMqParserRuntime(config);

    await expect(
      runtime.publishJson(parserExchange, "parse.requested", {
        checksum: { algorithm: "sha256", value: "a".repeat(64) },
        job_id: "job-1",
        object_key: "raw/replay.ocap.json",
        parser_contract_version: "3.0.0",
        replay_id: "replay-1",
      }),
    ).rejects.toThrow("confirm failed");
  });

  it("consumes parser result queues, acks successes, nacks failures, and closes", async () => {
    const runtime = await createRabbitMqParserRuntime(config),
      completed = vi.fn(async () => {}),
      failed = vi.fn(async () => {
        throw new Error("temporary failure");
      });

    await runtime.consumeParserResults({ completed, failed });
    consumers.get(parseCompletedQueue)?.(
      message({ message_type: "parse.completed" }),
    );
    consumers.get(parseFailedQueue)?.(
      message({ message_type: "parse.failed" }),
    );
    consumers.get(parseFailedQueue)?.(null);
    await vi.waitFor(() => {
      expect(mocks.consumeChannel.ack).toHaveBeenCalledOnce();
    });

    expect(mocks.consumeChannel.prefetch).toHaveBeenCalledWith(10);
    expect(completed).toHaveBeenCalledWith({ message_type: "parse.completed" });
    expect(failed).toHaveBeenCalledWith({ message_type: "parse.failed" });
    expect(mocks.consumeChannel.nack).toHaveBeenCalledWith(
      expect.anything(),
      false,
      true,
    );

    await runtime.close();
    expect(mocks.consumeChannel.cancel).toHaveBeenCalledWith(
      `${parseCompletedQueue}-consumer`,
    );
    expect(mocks.consumeChannel.cancel).toHaveBeenCalledWith(
      `${parseFailedQueue}-consumer`,
    );
    expect(mocks.consumeChannel.close).toHaveBeenCalledOnce();
    expect(mocks.publishChannel.close).toHaveBeenCalledOnce();
    expect(mocks.connection.close).toHaveBeenCalledOnce();
  });
});

function message(payload: unknown): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
  } as ConsumeMessage;
}

function expectParserTopologyAssertions(): void {
  expect(mocks.publishChannel.assertExchange).toHaveBeenCalledWith(
    parserExchange,
    "direct",
    { durable: true },
  );
  expect(mocks.publishChannel.assertQueue).toHaveBeenCalledWith(
    parseRequestedQueue,
    { durable: true },
  );
  expect(mocks.consumeChannel.bindQueue).toHaveBeenCalledWith(
    parseRequestedQueue,
    parserExchange,
    parseRequestedRoutingKey,
  );
  expect(mocks.consumeChannel.bindQueue).toHaveBeenCalledWith(
    parseCompletedQueue,
    parserExchange,
    parseCompletedRoutingKey,
  );
}
