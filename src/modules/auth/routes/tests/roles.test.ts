import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import { InMemoryAuthUserRepository, InMemorySessionStore } from "../memory.js";

import { authCookieName, FakeSteamOpenIdAdapter, steamId } from "./fixtures.js";

const FORBIDDEN = 403,
  NOT_FOUND = 404,
  UNAUTHORIZED = 401;

describe("admin role routes", () => {
  it("recognizes the configured bootstrap admin after Steam login", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      users = new InMemoryAuthUserRepository(steamId),
      app = await buildRoleApp(steam, users);

    try {
      const callback = await app.inject({
          method: "GET",
          url: "/auth/steam/callback",
        }),
        cookie = requireCookie(callback.cookies),
        session = await app.inject({
          headers: { cookie: `${cookie.name}=${cookie.value}` },
          method: "GET",
          url: "/auth/session",
        });

      expect(session.json()).toMatchObject({
        authenticated: true,
        user: { roles: ["admin"], steamId },
      });
    } finally {
      await app.close();
    }
  });

  it("lists users and assigns roles through the admin API shape", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      users = new InMemoryAuthUserRepository(steamId),
      app = await buildRoleApp(steam, users),
      user = await users.upsertSteamUser({
        displayName: "Target User",
        steamId: "target-steam",
      });

    try {
      const adminCookie = await loginCookie(app);

      const updated = await app.inject({
          body: { roles: ["moderator"] },
          headers: { cookie: adminCookie },
          method: "PUT",
          url: `/admin/users/${user.id}/roles`,
        }),
        list = await app.inject({
          headers: { cookie: adminCookie },
          method: "GET",
          url: "/admin/users",
        });

      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        id: user.id,
        roles: ["moderator"],
      });
      expect(list.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: user.id,
            roles: ["moderator"],
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it("returns not found when assigning roles to a missing user", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      users = new InMemoryAuthUserRepository(steamId),
      app = await buildRoleApp(steam, users),
      missingUserId = "00000000-0000-4000-8000-000000000699";

    try {
      const adminCookie = await loginCookie(app);

      const response = await app.inject({
        body: { roles: ["admin"] },
        headers: { cookie: adminCookie },
        method: "PUT",
        url: `/admin/users/${missingUserId}/roles`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "user not found" });
    } finally {
      await app.close();
    }
  });

  it("rejects role APIs for anonymous and non-admin users", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      users = new InMemoryAuthUserRepository(),
      app = await buildRoleApp(steam, users);

    try {
      const anonymous = await app.inject({
          method: "GET",
          url: "/admin/users",
        }),
        userCookie = await loginCookie(app),
        forbidden = await app.inject({
          headers: { cookie: userCookie },
          method: "GET",
          url: "/admin/users",
        });

      expect(anonymous.statusCode).toBe(UNAUTHORIZED);
      expect(anonymous.json()).toEqual({ message: "authentication required" });
      expect(forbidden.statusCode).toBe(FORBIDDEN);
      expect(forbidden.json()).toEqual({ message: "required role missing" });
    } finally {
      await app.close();
    }
  });
});

async function loginCookie(app: Awaited<ReturnType<typeof buildRoleApp>>) {
  const callback = await app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    cookie = requireCookie(callback.cookies);
  return `${cookie.name}=${cookie.value}`;
}

async function buildRoleApp(
  steam: FakeSteamOpenIdAdapter,
  users: InMemoryAuthUserRepository,
) {
  return buildApp({
    auth: {
      cookie: {
        name: authCookieName,
        ttlSeconds: 60,
      },
      publicBaseUrl: "http://localhost:3000",
      sessions: new InMemorySessionStore(),
      steam,
      users,
    },
  });
}

function requireCookie(cookies: { name: string; value: string }[]) {
  const [cookie] = cookies;
  if (cookie === undefined) {
    throw new Error("Expected auth response to set a session cookie.");
  }
  return cookie;
}
