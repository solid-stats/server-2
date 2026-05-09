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
import { InMemoryRequestAttachmentStorage } from "./modules/requests/routes/attachment-storage.js";
import { registerAuditPatchRoutes } from "./modules/requests/routes/audit-patches/audit-patches.js";
import { NoopAuditPatchRecalculator } from "./modules/requests/routes/audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "./modules/requests/routes/memory.js";
import { registerRequestModerationRoutes } from "./modules/requests/routes/moderation/moderation.js";
import { EmptyReferenceValidator } from "./modules/requests/routes/reference-validator.js";
import { registerRequestRoutes } from "./modules/requests/routes/routes.js";
import { registerRequestWorkflowRoutes } from "./modules/requests/routes/workflows/workflows.js";
import { registerOpenApi } from "./openapi/register-openapi.js";

import type { AuthRouteOptions } from "./modules/auth/routes/models.js";
import type { RequestRouteOptions } from "./modules/requests/routes/models.js";
import type { Registry } from "prom-client";

const DEFAULT_SESSION_TTL_SECONDS = 2_592_000;

export interface BuildAppOptions {
  auth?: AuthRouteOptions;
  logger?: FastifyServerOptions["logger"];
  checks?: Record<string, HealthCheckable>;
  ingestReadModel?: IngestReadModel;
  metrics?: Registry;
  publicStatsReadModel?: PublicStatsReadModel;
  requests?: Omit<RequestRouteOptions, "auth">;
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
  const auth = options.auth ?? createDefaultAuthOptions(),
    requests = options.requests ?? createDefaultRequestOptions();
  await registerAuthRoutes(app, auth);
  await registerRequestRoutes(app, {
    auth,
    ...requests,
  });
  await registerRequestModerationRoutes(app, {
    auth,
    ...requests,
  });
  await registerAuditPatchRoutes(app, {
    auth,
    ...requests,
  });
  await registerRequestWorkflowRoutes(app, {
    auth,
    ...requests,
  });
  await registerPublicStatsRoutes(app, {
    readModel:
      options.publicStatsReadModel ?? createEmptyPublicStatsReadModel(),
  });

  return app;
}

function createDefaultRequestOptions(): Omit<RequestRouteOptions, "auth"> {
  const requests = new InMemoryPlayerRequestRepository();
  return {
    attachmentStorage: new InMemoryRequestAttachmentStorage(),
    attachments: requests,
    auditPatches: requests,
    auditRecalculator: new NoopAuditPatchRecalculator(),
    moderation: requests,
    references: new EmptyReferenceValidator(),
    requests,
    workflows: requests,
  };
}

interface DefaultAuthConfig {
  bootstrapAdminSteamId?: string;
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
    users: new InMemoryAuthUserRepository(config.bootstrapAdminSteamId),
  };
}
