import { buildApp } from "../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../auth/routes/memory.js";
import { InMemoryRequestAttachmentStorage } from "../attachment-storage.js";
import { NoopAuditPatchRecalculator } from "../audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "../memory.js";
import { createNoopRequestWorkflowApplier } from "../workflow-applier.js";

import { FakeReferenceValidator } from "./references.js";
import { FakeRequestSteamAdapter } from "./steam.js";

import type {
  ReferenceValidator,
  RequestAttachmentStorage,
} from "../models.js";

export const requestCookieName = "request_session_test";

export async function buildRequestsApp(
  options: {
    attachmentStorage?: RequestAttachmentStorage;
    references?: ReferenceValidator;
    requests?: InMemoryPlayerRequestRepository;
    steam?: FakeRequestSteamAdapter;
  } = {},
) {
  const requests = options.requests ?? new InMemoryPlayerRequestRepository(),
    steam = options.steam ?? new FakeRequestSteamAdapter();
  return buildApp({
    auth: {
      cookie: {
        name: requestCookieName,
        ttlSeconds: 60,
      },
      publicBaseUrl: "http://localhost:3000",
      sessions: new InMemorySessionStore(),
      steam,
      users: new InMemoryAuthUserRepository(),
    },
    requests: {
      attachmentStorage:
        options.attachmentStorage ?? new InMemoryRequestAttachmentStorage(),
      attachments: requests,
      auditPatches: requests,
      auditRecalculator: new NoopAuditPatchRecalculator(),
      moderation: requests,
      references: options.references ?? new FakeReferenceValidator(),
      requests,
      workflowApplier: createNoopRequestWorkflowApplier(),
      workflows: requests,
    },
  });
}

export async function loginCookie(
  app: Awaited<ReturnType<typeof buildRequestsApp>>,
) {
  const callback = await app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    cookie = requireCookie(callback.cookies);
  return `${cookie.name}=${cookie.value}`;
}

export function requireCookie(cookies: { name: string; value: string }[]) {
  const [cookie] = cookies;
  if (cookie === undefined) {
    throw new Error("Expected auth response to set a session cookie.");
  }
  return cookie;
}
