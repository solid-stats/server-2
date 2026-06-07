/* eslint-disable unicorn/no-null */
import { expect, it } from "vitest";

import {
  buildAdminApp,
  CONFLICT,
  CREATED,
  createRotationId,
  login,
  UNPROCESSABLE,
  validBody,
} from "./utilities.js";

it("Maps update conflicts to 409 (dup name) and 422 (bad range)", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002008",
        users,
      }),
      existingId = await createRotationId(
        app,
        adminCookie,
        "Existing Rotation",
      ),
      targetId = await createRotationId(app, adminCookie, "Target Rotation"),
      duplicate = await app.inject({
        body: validBody("Existing Rotation"),
        headers: { cookie: adminCookie },
        method: "PUT",
        url: `/admin/rotations/${targetId}`,
      }),
      badRange = await app.inject({
        body: {
          endsAt: "2026-01-01T00:00:00.000Z",
          name: "Target Rotation",
          startsAt: "2026-02-01T00:00:00.000Z",
        },
        headers: { cookie: adminCookie },
        method: "PUT",
        url: `/admin/rotations/${targetId}`,
      });

    expect(existingId).not.toBe(targetId);
    expect(duplicate.statusCode).toBe(CONFLICT);
    expect(duplicate.json()).toEqual({
      message: "rotation name already exists",
    });
    expect(badRange.statusCode).toBe(UNPROCESSABLE);
    expect(badRange.json()).toEqual({
      message: "endsAt must be after startsAt",
    });
  } finally {
    await app.close();
  }
});

it("Falls back to a default slug when a name has no slug-able characters", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002009",
        users,
      }),
      created = await app.inject({
        body: {
          endsAt: null,
          name: "!!!",
          startsAt: "2026-01-01T00:00:00.000Z",
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: "/admin/rotations",
      });

    expect(created.statusCode).toBe(CREATED);
    expect(created.json()).toMatchObject({
      endsAt: null,
      name: "!!!",
      slug: "rotation",
    });
  } finally {
    await app.close();
  }
});
