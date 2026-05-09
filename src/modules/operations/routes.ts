import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Registry } from "prom-client";

import { checkAll, type HealthCheckable } from "../../infra/health.js";

export interface OperationsRouteOptions {
  checks: Record<string, HealthCheckable>;
  metrics: Registry;
}

const LiveResponse = Type.Object({
  status: Type.Literal("ok"),
});

const HealthCheckResultSchema = Type.Object({
  status: Type.Union([Type.Literal("ok"), Type.Literal("error")]),
  message: Type.Optional(Type.String()),
});

const ReadyResponse = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
  checks: Type.Record(Type.String(), HealthCheckResultSchema),
});

export async function registerOperationsRoutes(
  app: FastifyInstance,
  options: OperationsRouteOptions,
): Promise<void> {
  app.get(
    "/live",
    {
      schema: {
        tags: ["operations"],
        response: {
          200: LiveResponse,
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["operations"],
        response: {
          200: ReadyResponse,
          503: ReadyResponse,
        },
      },
    },
    async (_request, reply) => {
      const summary = await checkAll(options.checks);
      const status = summary.ready ? "ready" : "degraded";
      return reply.code(summary.ready ? 200 : 503).send({
        status,
        checks: summary.checks,
      });
    },
  );

  app.get(
    "/metrics",
    {
      schema: {
        tags: ["operations"],
        response: {
          200: Type.String(),
        },
      },
    },
    async (_request, reply) => {
      reply.header("content-type", options.metrics.contentType);
      return options.metrics.metrics();
    },
  );

  app.get(
    "/openapi.json",
    {
      schema: {
        hide: true,
      },
    },
    async () => app.swagger(),
  );
}
