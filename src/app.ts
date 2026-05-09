import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import {
  type HealthCheckable,
  createStaticHealthCheck,
} from "./infra/health.js";
import { createMetricsRegistry } from "./infra/metrics/registry.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "./modules/auth/routes/memory.js";
import { registerAuthRoutes } from "./modules/auth/routes/routes.js";
import { SteamOpenIdClient } from "./modules/auth/routes/steam-openid.js";
import {
  createEmptyIngestReadModel,
  type IngestReadModel,
  registerIngestRoutes,
} from "./modules/ingest/routes.js";
import { registerOperationsRoutes } from "./modules/operations/routes.js";
import {
  createEmptyPublicStatsReadModel,
  type PublicStatsReadModel,
  registerPublicStatsRoutes,
} from "./modules/public-stats/routes/routes.js";
import { registerOpenApi } from "./openapi/register-openapi.js";

import type { AuthRouteOptions } from "./modules/auth/routes/models.js";
import type { Registry } from "prom-client";

const DEFAULT_SESSION_TTL_SECONDS = 2_592_000;

export interface BuildAppOptions {
  auth?: AuthRouteOptions;
  logger?: FastifyServerOptions["logger"];
  checks?: Record<string, HealthCheckable>;
  ingestReadModel?: IngestReadModel;
  metrics?: Registry;
  publicStatsReadModel?: PublicStatsReadModel;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerOpenApi(app);
  await registerOperationsRoutes(app, {
    checks: options.checks ?? {
      db: createStaticHealthCheck(),
      queue: createStaticHealthCheck(),
      storage: createStaticHealthCheck(),
    },
    metrics: options.metrics ?? createMetricsRegistry(),
  });
  await registerIngestRoutes(app, {
    readModel: options.ingestReadModel ?? createEmptyIngestReadModel(),
  });
  await registerAuthRoutes(app, options.auth ?? createDefaultAuthOptions());
  await registerPublicStatsRoutes(app, {
    readModel:
      options.publicStatsReadModel ?? createEmptyPublicStatsReadModel(),
  });

  return app;
}

interface DefaultAuthConfig {
  publicBaseUrl?: string;
  sessionCookieName?: string;
  sessionTtlSeconds?: number;
}

export function createDefaultAuthOptions(
  config: DefaultAuthConfig = {},
): AuthRouteOptions {
  return {
    cookie: {
      name: config.sessionCookieName ?? "solid_stats_session",
      ttlSeconds: config.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS,
    },
    publicBaseUrl: config.publicBaseUrl ?? "http://localhost:3000",
    sessions: new InMemorySessionStore(),
    steam: new SteamOpenIdClient(),
    users: new InMemoryAuthUserRepository(),
  };
}
