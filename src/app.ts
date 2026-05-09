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
  createEmptyIngestReadModel,
  type IngestReadModel,
  registerIngestRoutes,
} from "./modules/ingest/routes.js";
import { registerOperationsRoutes } from "./modules/operations/routes.js";
import {
  createEmptyPublicStatsReadModel,
  type PublicStatsReadModel,
  registerPublicStatsRoutes,
} from "./modules/public-stats/routes.js";
import { registerOpenApi } from "./openapi/register-openapi.js";

import type { Registry } from "prom-client";

export interface BuildAppOptions {
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
  await registerPublicStatsRoutes(app, {
    readModel:
      options.publicStatsReadModel ?? createEmptyPublicStatsReadModel(),
  });

  return app;
}
