import { expect, it } from "vitest";

import {
  buildModerationApp,
  createPlayerRequest,
  loginAs,
} from "./utilities.js";

const FORBIDDEN = 403,
  NOT_FOUND = 404,
  OK = 200,
  UNAUTHORIZED = 401;

it("Lists request queue and records moderator approval history", async () => {
  const { app, steam, users } = await buildModerationApp();

  try {
    const playerCookie = await loginAs({
        app,
        identity: {
          displayName: "Request Player",
          steamId: "76561198000000801",
        },
        steam,
        users,
      }),
      requestId = await createPlayerRequest(app, playerCookie),
      secondRequestId = await createPlayerRequest(app, playerCookie),
      moderatorCookie = await loginAs({
        app,
        identity: {
          displayName: "Moderator",
          steamId: "76561198000000802",
        },
        roles: ["moderator"],
        steam,
        users,
      }),
      queue = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: "/moderation/requests",
      }),
      initialDetail = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}`,
      }),
      decision = await app.inject({
        body: {
          comment: "Evidence is sufficient.",
          decision: "approved",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/decision`,
      }),
      rejected = await app.inject({
        body: {
          comment: "Second review rejected.",
          decision: "rejected",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/decision`,
      }),
      detail = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}`,
      });

    expect(queue.statusCode).toBe(OK);
    expect(queue.json()).toEqual([
      expect.objectContaining({ id: requestId, status: "submitted" }),
      expect.objectContaining({ id: secondRequestId, status: "submitted" }),
    ]);
    expect(initialDetail.json()).toMatchObject({
      history: [],
      request: { id: requestId, status: "submitted" },
    });
    expect(decision.statusCode).toBe(OK);
    expect(decision.json()).toMatchObject({
      action: { action: "approve", comment: "Evidence is sufficient." },
      request: { id: requestId, status: "approved" },
    });
    expect(detail.json()).toMatchObject({
      history: [
        { action: "approve", comment: "Evidence is sufficient.", requestId },
        { action: "reject", comment: "Second review rejected.", requestId },
      ],
      request: { id: requestId, status: "rejected" },
    });
    expect(rejected.statusCode).toBe(OK);
  } finally {
    await app.close();
  }
});

it("Rejects moderation queue access for anonymous and unprivileged users", async () => {
  const { app, steam, users } = await buildModerationApp();

  try {
    const anonymous = await app.inject({
        method: "GET",
        url: "/moderation/requests",
      }),
      userCookie = await loginAs({
        app,
        identity: {
          displayName: "Plain User",
          steamId: "76561198000000803",
        },
        steam,
        users,
      }),
      forbidden = await app.inject({
        headers: { cookie: userCookie },
        method: "GET",
        url: "/moderation/requests",
      });

    expect(anonymous.statusCode).toBe(UNAUTHORIZED);
    expect(anonymous.json()).toEqual({ message: "authentication required" });
    expect(forbidden.statusCode).toBe(FORBIDDEN);
    expect(forbidden.json()).toEqual({ message: "required role missing" });
  } finally {
    await app.close();
  }
});

it("Allows admins to reject requests and returns not found for missing requests", async () => {
  const { app, steam, users } = await buildModerationApp();

  try {
    const playerCookie = await loginAs({
        app,
        identity: {
          displayName: "Second Request Player",
          steamId: "76561198000000804",
        },
        steam,
        users,
      }),
      requestId = await createPlayerRequest(app, playerCookie),
      adminCookie = await loginAs({
        app,
        identity: {
          displayName: "Admin",
          steamId: "76561198000000805",
        },
        roles: ["admin"],
        steam,
        users,
      }),
      rejected = await app.inject({
        body: {
          comment: "Evidence does not match the replay.",
          decision: "rejected",
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/decision`,
      }),
      missingDetail = await app.inject({
        headers: { cookie: adminCookie },
        method: "GET",
        url: "/moderation/requests/00000000-0000-4000-8000-000000000703",
      }),
      missingDecision = await app.inject({
        body: {
          comment: "Missing request.",
          decision: "approved",
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: "/moderation/requests/00000000-0000-4000-8000-000000000703/decision",
      });

    expect(rejected.statusCode).toBe(OK);
    expect(rejected.json()).toMatchObject({
      action: { action: "reject" },
      request: { id: requestId, status: "rejected" },
    });
    expect(missingDetail.statusCode).toBe(NOT_FOUND);
    expect(missingDetail.json()).toEqual({ message: "request not found" });
    expect(missingDecision.statusCode).toBe(NOT_FOUND);
    expect(missingDecision.json()).toEqual({ message: "request not found" });
  } finally {
    await app.close();
  }
});
