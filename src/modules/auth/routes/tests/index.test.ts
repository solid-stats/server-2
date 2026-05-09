import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import { InMemoryAuthUserRepository, InMemorySessionStore } from "../memory.js";

import { authCookieName, FakeSteamOpenIdAdapter } from "./fixtures.js";

const REDIRECT = 302,
  UNAUTHORIZED = 401;

describe("auth routes", () => {
  it("redirects Steam login to the injected OpenID adapter", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);

    try {
      const response = await app.inject({
        method: "GET",
        url: "/auth/steam/login?redirectTo=/requests",
      });

      expect(response.statusCode).toBe(REDIRECT);
      expect(response.headers.location).toBe(
        "https://steamcommunity.com/openid/login?test=1",
      );
      expect(steam.lastLoginInput).toEqual({
        realm: "http://localhost:3000",
        returnTo:
          "http://localhost:3000/auth/steam/callback?redirectTo=%2Frequests",
      });
    } finally {
      await app.close();
    }
  });

  it("serves anonymous session state when no session cookie is present", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);

    try {
      const response = await app.inject({
        method: "GET",
        url: "/auth/session",
      });

      expect(response.json()).toEqual({ authenticated: false });
    } finally {
      await app.close();
    }
  });

  it("serves logout response when no session cookie is present", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/logout",
      });

      expect(response.json()).toEqual({ authenticated: false });
      expect(response.headers["set-cookie"]).toContain("Max-Age=0");
    } finally {
      await app.close();
    }
  });
});

describe("auth session routes", () => {
  it("creates a session from a valid Steam callback and returns it", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);

    try {
      const callback = await app.inject({
          method: "GET",
          url: "/auth/steam/callback?redirectTo=/requests&openid.claimed_id=claimed&openid.mode=id_res",
        }),
        cookie = requireCookie(callback.cookies),
        session = await app.inject({
          headers: { cookie: `${cookie.name}=${cookie.value}` },
          method: "GET",
          url: "/auth/session",
        });

      expect(callback.statusCode).toBe(REDIRECT);
      expect(callback.headers.location).toBe("/requests");
      expect(cookie.name).toBe(authCookieName);
      expect(session.json()).toMatchObject({
        authenticated: true,
        user: {
          displayName: "Steam Alpha",
          roles: [],
        },
      });
    } finally {
      await app.close();
    }
  });

  it("clears the session on logout", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);

    try {
      const callback = await app.inject({
          method: "GET",
          url: "/auth/steam/callback",
        }),
        cookie = requireCookie(callback.cookies),
        logout = await app.inject({
          headers: { cookie: `${cookie.name}=${cookie.value}` },
          method: "POST",
          url: "/auth/logout",
        }),
        session = await app.inject({
          headers: { cookie: `${cookie.name}=${cookie.value}` },
          method: "GET",
          url: "/auth/session",
        });

      expect(logout.json()).toEqual({ authenticated: false });
      expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
      expect(session.json()).toEqual({ authenticated: false });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid Steam callbacks and unsafe redirect paths", async () => {
    const steam = new FakeSteamOpenIdAdapter(),
      app = await buildAuthApp(steam);
    steam.shouldReject = true;

    try {
      const login = await app.inject({
          method: "GET",
          url: "/auth/steam/login?redirectTo=https://evil.example",
        }),
        callback = await app.inject({
          method: "GET",
          url: "/auth/steam/callback",
        });

      expect(steam.lastLoginInput?.returnTo).toBe(
        "http://localhost:3000/auth/steam/callback?redirectTo=%2F",
      );
      expect(login.statusCode).toBe(REDIRECT);
      expect(callback.statusCode).toBe(UNAUTHORIZED);
      expect(callback.json()).toEqual({
        message: "steam authentication failed",
      });
    } finally {
      await app.close();
    }
  });
});

async function buildAuthApp(steam: FakeSteamOpenIdAdapter) {
  return buildApp({
    auth: {
      cookie: {
        name: authCookieName,
        ttlSeconds: 60,
      },
      publicBaseUrl: "http://localhost:3000",
      sessions: new InMemorySessionStore(),
      steam,
      users: new InMemoryAuthUserRepository(),
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
