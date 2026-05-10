import { expect, it } from "vitest";

import {
  approveRequest,
  buildWorkflowApp,
  createRequest,
  login,
} from "./utilities.js";

const NOT_FOUND = 404,
  OK = 200,
  UNPROCESSABLE = 422;

it("Applies manual legacy winner fixes for approved stats correction requests", async () => {
  const { app, steam, users, workflowApplier } = await buildWorkflowApp();

  try {
    const playerCookie = await login({
        app,
        roles: [],
        steam,
        steamId: "76561198000001001",
        users,
      }),
      moderatorCookie = await login({
        app,
        roles: ["moderator"],
        steam,
        steamId: "76561198000001002",
        users,
      }),
      requestId = await createRequest(app, playerCookie, "stats_correction");

    await approveRequest(app, moderatorCookie, requestId);

    const emptyList = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}/workflows`,
      }),
      created = await app.inject({
        body: {
          action: "legacy_winner_fix",
          payload: { replayId: "replay-1", winnerSide: "west" },
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/workflows`,
      }),
      listed = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: `/moderation/requests/${requestId}/workflows`,
      });

    expect(created.statusCode).toBe(OK);
    expect(emptyList.json()).toEqual([]);
    expect(created.json()).toMatchObject({
      action: "legacy_winner_fix",
      payload: { replayId: "replay-1", winnerSide: "west" },
      requestId,
    });
    expect(listed.json()).toMatchObject([{ action: "legacy_winner_fix" }]);
    expect(workflowApplier.inputs).toMatchObject([
      {
        action: "legacy_winner_fix",
        payload: { replayId: "replay-1", winnerSide: "west" },
      },
    ]);
  } finally {
    await app.close();
  }
});

it("Applies Steam linking and player merge or split workflows for matching approved requests", async () => {
  const { app, steam, users, workflowApplier } = await buildWorkflowApp();

  try {
    const playerCookie = await login({
        app,
        roles: [],
        steam,
        steamId: "76561198000001003",
        users,
      }),
      adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000001004",
        users,
      }),
      steamRequestId = await createRequest(app, playerCookie, "steam_link"),
      mergeRequestId = await createRequest(app, playerCookie, "merge_split");

    await approveRequest(app, adminCookie, steamRequestId);
    await approveRequest(app, adminCookie, mergeRequestId);

    const link = await app.inject({
        body: {
          action: "link_steam",
          payload: { playerId: "player-1", steamId: "steam-1" },
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/moderation/requests/${steamRequestId}/workflows`,
      }),
      merge = await app.inject({
        body: {
          action: "merge_players",
          payload: { sourcePlayerId: "player-2", targetPlayerId: "player-1" },
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/moderation/requests/${mergeRequestId}/workflows`,
      }),
      split = await app.inject({
        body: {
          action: "split_player",
          payload: { sourcePlayerId: "player-1", targetPlayerId: "player-3" },
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: `/moderation/requests/${mergeRequestId}/workflows`,
      }),
      listed = await app.inject({
        headers: { cookie: adminCookie },
        method: "GET",
        url: `/moderation/requests/${mergeRequestId}/workflows`,
      });

    expect(link.statusCode).toBe(OK);
    expect(merge.statusCode).toBe(OK);
    expect(split.statusCode).toBe(OK);
    expect(listed.json()).toMatchObject([
      { action: "merge_players" },
      { action: "split_player" },
    ]);
    expect(workflowApplier.inputs.map((input) => input.action)).toEqual([
      "link_steam",
      "merge_players",
      "split_player",
    ]);
  } finally {
    await app.close();
  }
});

it("Rejects workflow actions for missing, unapproved, or mismatched requests", async () => {
  const { app, steam, users } = await buildWorkflowApp();

  try {
    const playerCookie = await login({
        app,
        roles: [],
        steam,
        steamId: "76561198000001005",
        users,
      }),
      moderatorCookie = await login({
        app,
        roles: ["moderator"],
        steam,
        steamId: "76561198000001006",
        users,
      }),
      requestId = await createRequest(app, playerCookie, "steam_link"),
      unapproved = await app.inject({
        body: {
          action: "link_steam",
          payload: { playerId: "player-1", steamId: "steam-1" },
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: `/moderation/requests/${requestId}/workflows`,
      }),
      missing = await app.inject({
        body: {
          action: "link_steam",
          payload: { playerId: "player-1", steamId: "steam-1" },
        },
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: "/moderation/requests/00000000-0000-4000-8000-000000001005/workflows",
      }),
      missingList = await app.inject({
        headers: { cookie: moderatorCookie },
        method: "GET",
        url: "/moderation/requests/00000000-0000-4000-8000-000000001005/workflows",
      });

    await approveRequest(app, moderatorCookie, requestId);
    const mismatched = await app.inject({
      body: {
        action: "legacy_winner_fix",
        payload: { replayId: "replay-1", winnerSide: "east" },
      },
      headers: { cookie: moderatorCookie },
      method: "POST",
      url: `/moderation/requests/${requestId}/workflows`,
    });

    expect(unapproved.statusCode).toBe(UNPROCESSABLE);
    expect(unapproved.json()).toEqual({
      message: "workflow action does not match an approved request",
    });
    expect(mismatched.statusCode).toBe(UNPROCESSABLE);
    expect(missing.statusCode).toBe(NOT_FOUND);
    expect(missing.json()).toEqual({ message: "request not found" });
    expect(missingList.statusCode).toBe(NOT_FOUND);
  } finally {
    await app.close();
  }
});
