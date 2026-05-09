/* eslint-disable unicorn/no-null */
import { expect, it } from "vitest";

import {
  buildAuditPatchApp,
  createStatsRequest,
  loginAs,
} from "./utilities.js";

const OK = 200,
  NOT_FOUND = 404,
  UNPROCESSABLE = 422;

it("Creates audit patches for approved stats correction requests and triggers recalculation", async () => {
  const { app, auditRecalculator, steam, users } = await buildAuditPatchApp();

  try {
    const playerCookie = await loginAs({
        app,
        roles: [],
        steam,
        steamId: "76561198000000901",
        users,
      }),
      requestId = await createStatsRequest(app, playerCookie),
      moderatorCookie = await loginAs({
        app,
        roles: ["moderator"],
        steam,
        steamId: "76561198000000902",
        users,
      });

    await app.inject({
      body: {
        comment: "Approved for audit patch.",
        decision: "approved",
      },
      headers: { cookie: moderatorCookie },
      method: "POST",
      url: `/moderation/requests/${requestId}/decision`,
    });

    const emptyList = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}/audit-patches`,
      }),
      created = await app.inject({
        body: {
          affectedEntityId: "00000000-0000-4000-8000-000000000901",
          affectedEntityType: "player_stat",
          patch: { kills: 12 },
          reason: "Parser missed a kill.",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/audit-patches`,
      }),
      listed = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}/audit-patches`,
      }),
      second = await app.inject({
        body: {
          affectedEntityType: "squad_stat",
          patch: { kills: 3 },
          reason: "Squad rollup correction.",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/audit-patches`,
      }),
      finalList = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}/audit-patches`,
      });

    expect(created.statusCode).toBe(OK);
    expect(created.json()).toMatchObject({
      affectedEntityId: "00000000-0000-4000-8000-000000000901",
      affectedEntityType: "player_stat",
      patch: { kills: 12 },
      reason: "Parser missed a kill.",
      recalculationStatus: "recalculated",
      requestId,
    });
    expect(auditRecalculator.input).toMatchObject({
      affectedEntityType: "squad_stat",
      patch: { kills: 3 },
      requestId,
    });
    expect(listed.json()).toMatchObject([
      { affectedEntityType: "player_stat", requestId },
    ]);
    expect(emptyList.statusCode).toBe(OK);
    expect(second.statusCode).toBe(OK);
    expect(second.json()).toMatchObject({
      affectedEntityId: null,
      affectedEntityType: "squad_stat",
    });
    expect(finalList.json()).toMatchObject([
      { affectedEntityType: "player_stat" },
      { affectedEntityType: "squad_stat" },
    ]);
  } finally {
    await app.close();
  }
});

it("Rejects audit patches for missing or not approved requests", async () => {
  const { app, steam, users } = await buildAuditPatchApp();

  try {
    const playerCookie = await loginAs({
        app,
        roles: [],
        steam,
        steamId: "76561198000000903",
        users,
      }),
      requestId = await createStatsRequest(app, playerCookie),
      moderatorCookie = await loginAs({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000000904",
        users,
      }),
      unapproved = await app.inject({
        body: {
          affectedEntityType: "player_stat",
          patch: { kills: 12 },
          reason: "Not approved yet.",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/audit-patches`,
      }),
      missing = await app.inject({
        body: {
          affectedEntityType: "player_stat",
          patch: { kills: 12 },
          reason: "Missing request.",
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: "/moderation/requests/00000000-0000-4000-8000-000000000904/audit-patches",
      }),
      missingList = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: "/moderation/requests/00000000-0000-4000-8000-000000000904/audit-patches",
      });

    expect(unapproved.statusCode).toBe(UNPROCESSABLE);
    expect(unapproved.json()).toEqual({
      message: "request must be an approved stats correction",
    });
    expect(missing.statusCode).toBe(NOT_FOUND);
    expect(missing.json()).toEqual({ message: "request not found" });
    expect(missingList.statusCode).toBe(NOT_FOUND);
    expect(missingList.json()).toEqual({ message: "request not found" });
  } finally {
    await app.close();
  }
});
