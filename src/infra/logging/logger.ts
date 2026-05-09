import type { FastifyServerOptions } from "fastify";

import type { AppConfig } from "../../config/env.js";

export function createLoggerOptions(
  config: AppConfig,
): FastifyServerOptions["logger"] {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        "databaseUrl",
        "rabbitmqUrl",
        "s3.accessKeyId",
        "s3.secretAccessKey",
        "*.password",
        "*.secret",
      ],
      censor: "redacted",
    },
  };
}
