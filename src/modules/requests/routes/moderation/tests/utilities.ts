import { buildApp } from "../../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../../auth/routes/memory.js";
import { InMemoryRequestAttachmentStorage } from "../../attachment-storage.js";
import { InMemoryPlayerRequestRepository } from "../../memory.js";
import { EmptyReferenceValidator } from "../../reference-validator.js";
import { FakeRequestSteamAdapter } from "../../tests/steam.js";

export const moderatorCookieName = "moderation_session_test";

export async function buildModerationApp() {
  const requests = new InMemoryPlayerRequestRepository(),
    steam = new FakeRequestSteamAdapter(),
    users = new InMemoryAuthUserRepository();
  return {
    app: await buildApp({
      auth: {
        cookie: {
          name: moderatorCookieName,
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
        moderation: requests,
        references: new EmptyReferenceValidator(),
        requests,
      },
    }),
    steam,
    users,
  };
}

interface LoginAsInput {
  app: Awaited<ReturnType<typeof buildApp>>;
  identity: { displayName: string; steamId: string };
  roles?: string[];
  steam: FakeRequestSteamAdapter;
  users: InMemoryAuthUserRepository;
}

export async function loginAs(input: LoginAsInput): Promise<string> {
  const roles = input.roles ?? [];
  input.steam.identity = input.identity;
  const callback = await input.app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    cookie = requireCookie(callback.cookies),
    users = await input.users.listUsers(),
    user = users.find(
      (candidate) => candidate.steamId === input.identity.steamId,
    );
  /* v8 ignore next 3 */
  if (user === undefined) {
    throw new Error("Expected login to create a user.");
  }
  await input.users.setUserRoles(user.id, roles);
  return `${cookie.name}=${cookie.value}`;
}

export async function createPlayerRequest(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
): Promise<string> {
  const response = await app.inject({
      body: {
        description: "Stats need moderation",
        type: "stats_correction",
      },
      headers: { cookie },
      method: "POST",
      url: "/requests",
    }),
    body: { id: string } = response.json();
  return body.id;
}

function requireCookie(cookies: { name: string; value: string }[]) {
  const [cookie] = cookies;
  /* v8 ignore next 3 */
  if (cookie === undefined) {
    throw new Error("Expected auth response to set a session cookie.");
  }
  return cookie;
}
