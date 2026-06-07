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
import { InMemoryAdminRotationRepository } from "./modules/admin/routes/memory.js";
import { registerAdminRoutes } from "./modules/admin/routes/rotations.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "./modules/auth/routes/memory.js";
import { registerAuthRoutes } from "./modules/auth/routes/routes.js";
import { SteamOpenIdClient } from "./modules/auth/routes/steam-openid.js";
import {
  createEmptyIngestCommandModel,
  createEmptyIngestReadModel,
  type IngestCommandModel,
  type IngestReadModel,
  registerIngestRoutes,
} from "./modules/ingest/routes/routes.js";
import { registerOperationsRoutes } from "./modules/operations/routes.js";
import {
  createEmptyPublicStatsReadModel,
  type PublicStatsReadModel,
  registerPublicStatsRoutes,
} from "./modules/public-stats/routes/routes.js";
import { registerReplaySitemapRoutes } from "./modules/public-stats/routes/sitemap-routes.js";
import { InMemoryRequestAttachmentStorage } from "./modules/requests/routes/attachment-storage.js";
import { registerAuditPatchRoutes } from "./modules/requests/routes/audit-patches/audit-patches.js";
import { NoopAuditPatchRecalculator } from "./modules/requests/routes/audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "./modules/requests/routes/memory.js";
import { registerRequestModerationRoutes } from "./modules/requests/routes/moderation/moderation.js";
import { EmptyReferenceValidator } from "./modules/requests/routes/reference-validator.js";
import { registerRequestRoutes } from "./modules/requests/routes/routes.js";
import { createNoopRequestWorkflowApplier } from "./modules/requests/routes/workflow-applier.js";
import { registerRequestWorkflowRoutes } from "./modules/requests/routes/workflows/workflows.js";
import { registerOpenApi } from "./openapi/register-openapi.js";

import type { AdminRouteOptions } from "./modules/admin/routes/models.js";
import type { AuthRouteOptions } from "./modules/auth/routes/models.js";
import type { RequestRouteOptions } from "./modules/requests/routes/models.js";
import type { Registry } from "prom-client";

const DEFAULT_SESSION_TTL_SECONDS = 2_592_000;

export interface BuildAppOptions {
  admin?: Omit<AdminRouteOptions, "auth">;
  auth?: AuthRouteOptions;
  logger?: FastifyServerOptions["logger"];
  checks?: Record<string, HealthCheckable>;
  ingestCommands?: IngestCommandModel;
  ingestReadModel?: IngestReadModel;
  metrics?: Registry;
  /**
   * The public base URL used by the sitemap plugin for absolute `<loc>` URLs
   * (sitemaps.org requires absolute URLs). Defaults to `http://localhost:3000`
   * to match `PUBLIC_BASE_URL` env default in `config/env.ts`.
   */
  publicBaseUrl?: string;
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
  const auth = options.auth ?? createDefaultAuthOptions(),
    requests = options.requests ?? createDefaultRequestOptions(),
    admin = options.admin ?? createDefaultAdminOptions();
  await registerOperationsRoutes(app, {
    checks: options.checks ?? {
      db: createStaticHealthCheck(),
      parser: createStaticHealthCheck(),
      queue: createStaticHealthCheck(),
      storage: createStaticHealthCheck(),
    },
    metrics: options.metrics ?? createMetricsRegistry(),
  });
  await registerIngestRoutes(app, {
    auth,
    commands: options.ingestCommands ?? createEmptyIngestCommandModel(),
    readModel: options.ingestReadModel ?? createEmptyIngestReadModel(),
  });
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
  await registerAdminRoutes(app, {
    auth,
    ...admin,
  });
  const readModel =
    options.publicStatsReadModel ?? createEmptyPublicStatsReadModel();

  await registerPublicStatsRoutes(app, { readModel });

  // Phase 17 (REPLAY-04): Register sitemap routes as a SEPARATE top-level
  // plugin so they do NOT inherit the JSON child scope's preValidation /
  // error handler, and do NOT appear in the OpenAPI contract (no TypeBox schema).
  await registerReplaySitemapRoutes(app, {
    baseUrl: options.publicBaseUrl ?? "http://localhost:3000",
    readModel,
  });

  return app;
}

function createDefaultAdminOptions(): Omit<AdminRouteOptions, "auth"> {
  return {
    rotations: new InMemoryAdminRotationRepository(),
  };
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
    workflowApplier: createNoopRequestWorkflowApplier(),
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
