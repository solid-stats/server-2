import { buildApp } from "../../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../../auth/routes/memory.js";
import { InMemoryRequestAttachmentStorage } from "../../attachment-storage.js";
import { NoopAuditPatchRecalculator } from "../../audit-recalculator.js";
import { InMemoryPlayerRequestRepository } from "../../memory.js";
import { EmptyReferenceValidator } from "../../reference-validator.js";
import { FakeRequestSteamAdapter } from "../../tests/steam.js";
import { createNoopRequestWorkflowApplier } from "../../workflow-applier.js";

import type {
  ApplyRequestWorkflowInput,
  PlayerRequestType,
  RequestWorkflowApplier,
} from "../../models.js";

interface LoginInput {
  app: Awaited<ReturnType<typeof buildApp>>;
  roles: string[];
  steam: FakeRequestSteamAdapter;
  steamId: string;
  users: InMemoryAuthUserRepository;
}

export class FakeWorkflowApplier implements RequestWorkflowApplier {
  public inputs: ApplyRequestWorkflowInput[] = [];

  public async applyWorkflowAction(
    input: ApplyRequestWorkflowInput,
  ): Promise<{ status: string }> {
    this.inputs.push(input);
    return createNoopRequestWorkflowApplier().applyWorkflowAction(input);
  }
}

export async function buildWorkflowApp() {
  const workflowApplier = new FakeWorkflowApplier(),
    requests = new InMemoryPlayerRequestRepository(),
    steam = new FakeRequestSteamAdapter(),
    users = new InMemoryAuthUserRepository();
  return {
    app: await buildApp({
      auth: {
        cookie: {
          name: "workflow_session_test",
          ttlSeconds: 60,
        },
        publicBaseUrl: "http://localhost:3000",
        sessions: new InMemorySessionStore(),
        steam,
        users,
      },
      requests: {
        attachmentStorage: new InMemoryRequestAttachmentStorage(),
        attachments: requests,
        auditPatches: requests,
        auditRecalculator: new NoopAuditPatchRecalculator(),
        moderation: requests,
        references: new EmptyReferenceValidator(),
        requests,
        workflowApplier,
        workflows: requests,
      },
    }),
    steam,
    workflowApplier,
    users,
  };
}

export async function login(input: LoginInput): Promise<string> {
  input.steam.identity = {
    displayName: `Workflow User ${input.steamId}`,
    steamId: input.steamId,
  };
  const callback = await input.app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    cookie = requireCookie(callback.cookies),
    users = await input.users.listUsers(),
    user = users.find((candidate) => candidate.steamId === input.steamId);
  /* v8 ignore next 3 */
  if (user === undefined) {
    throw new Error("Expected login to create a user.");
  }
  await input.users.setUserRoles(user.id, input.roles);
  return `${cookie.name}=${cookie.value}`;
}

export async function createRequest(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
  type: PlayerRequestType,
): Promise<string> {
  const response = await app.inject({
      body: {
        description: "Workflow request",
        type,
      },
      headers: { cookie },
      method: "POST",
      url: "/requests",
    }),
    body: { id: string } = response.json();
  return body.id;
}

export async function approveRequest(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
  requestId: string,
): Promise<void> {
  await app.inject({
    body: {
      comment: "Approved for workflow.",
      decision: "approved",
    },
    headers: { cookie },
    method: "POST",
    url: `/moderation/requests/${requestId}/decision`,
  });
}

function requireCookie(cookies: { name: string; value: string }[]) {
  const [cookie] = cookies;
  /* v8 ignore next 3 */
  if (cookie === undefined) {
    throw new Error("Expected auth response to set a session cookie.");
  }
  return cookie;
}
