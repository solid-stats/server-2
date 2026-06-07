import { buildApp } from "../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../auth/routes/memory.js";
import { FakeRequestSteamAdapter } from "../../../requests/routes/tests/steam.js";
import { InMemoryAdminRotationRepository } from "../memory.js";

export const CREATED = 201,
  OK = 200,
  NO_CONTENT = 204,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE = 422;

const COOKIE_NAME = "admin_rotation_session_test";

interface LoginInput {
  app: Awaited<ReturnType<typeof buildApp>>;
  roles: string[];
  steam: FakeRequestSteamAdapter;
  steamId: string;
  users: InMemoryAuthUserRepository;
}

export async function buildAdminApp() {
  const rotations = new InMemoryAdminRotationRepository(),
    steam = new FakeRequestSteamAdapter(),
    users = new InMemoryAuthUserRepository();
  return {
    app: await buildApp({
      admin: { rotations },
      auth: {
        cookie: { name: COOKIE_NAME, ttlSeconds: 60 },
        publicBaseUrl: "http://localhost:3000",
        sessions: new InMemorySessionStore(),
        steam,
        users,
      },
    }),
    rotations,
    steam,
    users,
  };
}

export async function login(input: LoginInput): Promise<string> {
  input.steam.identity = {
    displayName: `Admin Rotation User ${input.steamId}`,
    steamId: input.steamId,
  };
  const callback = await input.app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    [cookie] = callback.cookies;
  /* v8 ignore next 3 */
  if (cookie === undefined) {
    throw new Error("Expected auth callback to set a session cookie.");
  }
  const users = await input.users.listUsers(),
    user = users.find((candidate) => candidate.steamId === input.steamId);
  /* v8 ignore next 3 */
  if (user === undefined) {
    throw new Error("Expected login to create a user.");
  }
  await input.users.setUserRoles(user.id, input.roles);
  return `${cookie.name}=${cookie.value}`;
}

export function validBody(name: string) {
  return {
    endsAt: "2026-02-01T00:00:00.000Z",
    name,
    startsAt: "2026-01-01T00:00:00.000Z",
  };
}

export async function createRotationId(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
  name: string,
): Promise<string> {
  const response = await app.inject({
      body: validBody(name),
      headers: { cookie },
      method: "POST",
      url: "/admin/rotations",
    }),
    body: { id: string } = response.json();
  return body.id;
}
