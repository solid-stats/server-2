import * as amqp from "amqplib";

import type { AppConfig } from "../../config/env.js";
import type { HealthCheckResult, HealthCheckable } from "../health.js";

export function createQueueClient(config: AppConfig): HealthCheckable {
  return {
    async check(): Promise<HealthCheckResult> {
      const probe = await amqp.connect(config.rabbitmqUrl),
        channel = await probe.createChannel();
      await channel.close();
      await probe.close();
      return { status: "ok" };
    },
    close: () => Promise.resolve(),
  };
}
