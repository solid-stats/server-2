import type { AppConfig } from "../../config/env.js";
import type { FastifyServerOptions } from "fastify";

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
        // Steam64 defense-in-depth: cover both top-level fields (e.g. logging a
        // raw DB row whose own key is `steam_ids`) and nested fields, plus the
        // array element wildcard so `steam_ids: [...]` is redacted (WR-01).
        "steamId",
        "steamIds",
        "steamIds[*]",
        "steam_id",
        "steam_ids",
        "steam_ids[*]",
        "*.steamId",
        "*.steamIds",
        "*.steamIds[*]",
        "*.steam_id",
        "*.steam_ids",
        "*.steam_ids[*]",
      ],
      censor: "redacted",
    },
  };
}
