/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { InMemoryPlayerRequestRepository } from "../memory.js";

import { buildRequestsApp, loginCookie, requireCookie } from "./fixtures.js";
import { FakeReferenceValidator, replayId } from "./references.js";
import { FakeRequestSteamAdapter } from "./steam.js";

const CREATED = 201,
  FOUND = 302,
  NOT_FOUND = 404,
  UNAUTHORIZED = 401,
  UNPROCESSABLE = 422;

describe("Player request auth helpers", () => {
  it("Starts Steam login with the request session cookie settings", async () => {
    const steam = new FakeRequestSteamAdapter(),
      app = await buildRequestsApp({ steam });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/auth/steam/login",
      });

      expect(response.statusCode).toBe(FOUND);
      expect(steam.lastLoginInput).toEqual({
        realm: "http://localhost:3000",
        returnTo: "http://localhost:3000/auth/steam/callback?redirectTo=%2F",
      });
    } finally {
      await app.close();
    }
  });

  it("Throws a clear fixture error when login does not set a cookie", async () => {
    expect(() => {
      requireCookie([]);
    }).toThrow("Expected auth response to set a session cookie.");
  });
});

it("Rejects request creation for anonymous users", async () => {
  const app = await buildRequestsApp();

  try {
    const response = await app.inject({
      body: {
        description: "Stats are wrong",
        type: "stats_correction",
      },
      method: "POST",
      url: "/requests",
    });

    expect(response.statusCode).toBe(UNAUTHORIZED);
    expect(response.json()).toEqual({ message: "authentication required" });
  } finally {
    await app.close();
  }
});

it("Creates and returns a submitted request with a valid reference", async () => {
  const references = new FakeReferenceValidator();
  references.allow({ id: replayId, type: "replay" });
  const app = await buildRequestsApp({ references });

  try {
    const cookie = await loginCookie(app),
      created = await app.inject({
        body: {
          description: "Kill count should be reviewed",
          reference: { id: replayId, type: "replay" },
          type: "stats_correction",
        },
        headers: { cookie },
        method: "POST",
        url: "/requests",
      }),
      createdBody: { id: string } = created.json(),
      detail = await app.inject({
        headers: { cookie },
        method: "GET",
        url: `/requests/${createdBody.id}`,
      }),
      list = await app.inject({
        headers: { cookie },
        method: "GET",
        url: "/requests",
      });

    expect(created.statusCode).toBe(CREATED);
    expect(created.json()).toMatchObject({
      description: "Kill count should be reviewed",
      reference: { id: replayId, type: "replay" },
      status: "submitted",
      type: "stats_correction",
    });
    expect(detail.json()).toMatchObject({ id: createdBody.id });
    expect(list.json()).toMatchObject([{ id: createdBody.id }]);
  } finally {
    await app.close();
  }
});

it("Creates a submitted request when reference is omitted", async () => {
  const app = await buildRequestsApp();

  try {
    const cookie = await loginCookie(app),
      created = await app.inject({
        body: {
          description: "Profile name should be corrected",
          type: "identity_correction",
        },
        headers: { cookie },
        method: "POST",
        url: "/requests",
      });

    expect(created.statusCode).toBe(CREATED);
    expect(created.json()).toMatchObject({
      description: "Profile name should be corrected",
      reference: null,
      status: "submitted",
      type: "identity_correction",
    });
  } finally {
    await app.close();
  }
});

it("Rejects request creation when referenced entity is missing", async () => {
  const app = await buildRequestsApp();

  try {
    const cookie = await loginCookie(app),
      response = await app.inject({
        body: {
          description: "Steam profile should be linked",
          reference: { id: replayId, type: "replay" },
          type: "steam_link",
        },
        headers: { cookie },
        method: "POST",
        url: "/requests",
      });

    expect(response.statusCode).toBe(UNPROCESSABLE);
    expect(response.json()).toEqual({
      message: "referenced entity not found",
    });
  } finally {
    await app.close();
  }
});

it("Rejects request status reads for anonymous users", async () => {
  const app = await buildRequestsApp();

  try {
    const list = await app.inject({
        method: "GET",
        url: "/requests",
      }),
      detail = await app.inject({
        method: "GET",
        url: "/requests/9f6d978c-2883-468b-bc5a-3f81ea6397ec",
      });

    expect(list.statusCode).toBe(UNAUTHORIZED);
    expect(list.json()).toEqual({ message: "authentication required" });
    expect(detail.statusCode).toBe(UNAUTHORIZED);
    expect(detail.json()).toEqual({ message: "authentication required" });
  } finally {
    await app.close();
  }
});

it("Does not expose another user's request detail", async () => {
  const requests = new InMemoryPlayerRequestRepository(),
    firstSteam = new FakeRequestSteamAdapter(),
    firstApp = await buildRequestsApp({ requests, steam: firstSteam });

  try {
    const firstCookie = await loginCookie(firstApp),
      created = await firstApp.inject({
        body: {
          description: "Identity should be split",
          type: "merge_split",
        },
        headers: { cookie: firstCookie },
        method: "POST",
        url: "/requests",
      }),
      createdBody: { id: string } = created.json();

    const secondSteam = new FakeRequestSteamAdapter();
    secondSteam.identity = {
      displayName: "Other User",
      steamId: "76561198000000702",
    };
    const secondApp = await buildRequestsApp({
      requests,
      steam: secondSteam,
    });
    try {
      const secondCookie = await loginCookie(secondApp),
        response = await secondApp.inject({
          headers: { cookie: secondCookie },
          method: "GET",
          url: `/requests/${createdBody.id}`,
        });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "request not found" });
    } finally {
      await secondApp.close();
    }
  } finally {
    await firstApp.close();
  }
});
