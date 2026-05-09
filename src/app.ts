import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Registry } from "prom-client";

import { createMetricsRegistry } from "./infra/metrics/registry.js";
import { registerOperationsRoutes } from "./modules/operations/routes.js";
import { registerOpenApi } from "./openapi/register-openapi.js";
import { createStaticHealthCheck, type HealthCheckable } from "./infra/health.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  checks?: Record<string, HealthCheckable>;
  metrics?: Registry;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false
  }).withTypeProvider<TypeBoxTypeProvider>();

  await registerOpenApi(app);
  await registerOperationsRoutes(app, {
    checks: options.checks ?? {
      db: createStaticHealthCheck(),
      queue: createStaticHealthCheck(),
      storage: createStaticHealthCheck()
    },
    metrics: options.metrics ?? createMetricsRegistry()
  });

  return app;
}
