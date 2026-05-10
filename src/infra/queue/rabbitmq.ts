import * as amqp from "amqplib";

import {
  parseCompletedQueue,
  parseCompletedRoutingKey,
  parseFailedQueue,
  parseFailedRoutingKey,
  parserExchange,
  type ConfirmingPublisher,
  type ParseCompletedMessage,
  type ParseFailedMessage,
  type ParseRequestMessage,
} from "./messages.js";

import type { AppConfig } from "../../config/env.js";
import type { Channel, ChannelModel, ConsumeMessage } from "amqplib";

const PREFETCH_COUNT = 10;

export interface ParserResultHandlers {
  completed(message: ParseCompletedMessage): Promise<void>;
  failed(message: ParseFailedMessage): Promise<void>;
}

export interface RabbitMqParserRuntime extends ConfirmingPublisher {
  close(): Promise<void>;
  consumeParserResults(handlers: ParserResultHandlers): Promise<void>;
}

class DefaultRabbitMqParserRuntime implements RabbitMqParserRuntime {
  private consumerTags: string[] = [];

  public constructor(
    private readonly connection: ChannelModel,
    private readonly publishChannel: amqp.ConfirmChannel,
    private readonly consumeChannel: Channel,
  ) {}

  public publishJson(
    exchange: string,
    routingKey: string,
    payload: ParseRequestMessage,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.publishChannel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: "application/json",
          persistent: true,
        },
        (error) => {
          if (error === null) {
            resolve();
            return;
          }
          reject(
            error instanceof Error
              ? error
              : new Error("RabbitMQ publish confirm failed"),
          );
        },
      );
    });
  }

  public async consumeParserResults(
    handlers: ParserResultHandlers,
  ): Promise<void> {
    await this.consumeChannel.prefetch(PREFETCH_COUNT);
    const completed = await this.consumeChannel.consume(
        parseCompletedQueue,
        (message) => {
          void this.handleCompletedMessage(message, handlers);
        },
      ),
      failed = await this.consumeChannel.consume(
        parseFailedQueue,
        (message) => {
          void this.handleFailedMessage(message, handlers);
        },
      );
    this.consumerTags = [completed.consumerTag, failed.consumerTag];
  }

  public async close(): Promise<void> {
    await Promise.all(
      this.consumerTags.map(async (tag) => this.consumeChannel.cancel(tag)),
    );
    await this.consumeChannel.close();
    await this.publishChannel.close();
    await this.connection.close();
  }

  private async handleCompletedMessage(
    message: ConsumeMessage | null,
    handlers: ParserResultHandlers,
  ): Promise<void> {
    await this.handleMessage(message, async (payload) =>
      handlers.completed(payload as ParseCompletedMessage),
    );
  }

  private async handleFailedMessage(
    message: ConsumeMessage | null,
    handlers: ParserResultHandlers,
  ): Promise<void> {
    await this.handleMessage(message, async (payload) =>
      handlers.failed(payload as ParseFailedMessage),
    );
  }

  private async handleMessage(
    message: ConsumeMessage | null,
    handler: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    if (message === null) {
      return;
    }
    try {
      await handler(JSON.parse(message.content.toString("utf8")) as unknown);
      this.consumeChannel.ack(message);
    } catch {
      this.consumeChannel.nack(message, false, true);
    }
  }
}

export async function createRabbitMqParserRuntime(
  config: AppConfig,
): Promise<RabbitMqParserRuntime> {
  const connection = await amqp.connect(config.rabbitmqUrl),
    publishChannel = await connection.createConfirmChannel(),
    consumeChannel = await connection.createChannel();
  await assertParserTopology(publishChannel);
  await assertParserTopology(consumeChannel);
  return new DefaultRabbitMqParserRuntime(
    connection,
    publishChannel,
    consumeChannel,
  );
}

async function assertParserTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(parserExchange, "direct", { durable: true });
  await channel.assertQueue(parseCompletedQueue, { durable: true });
  await channel.assertQueue(parseFailedQueue, { durable: true });
  await channel.bindQueue(
    parseCompletedQueue,
    parserExchange,
    parseCompletedRoutingKey,
  );
  await channel.bindQueue(
    parseFailedQueue,
    parserExchange,
    parseFailedRoutingKey,
  );
}
