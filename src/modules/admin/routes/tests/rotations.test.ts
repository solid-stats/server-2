import { expect, it } from "vitest";

import {
  buildAdminApp,
  CONFLICT,
  CREATED,
  createRotationId,
  FORBIDDEN,
  login,
  NO_CONTENT,
  NOT_FOUND,
  OK,
  UNAUTHORIZED,
  UNPROCESSABLE,
  validBody,
} from "./utilities.js";

it("Creates a rotation as an admin with a server-derived slug", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002001",
        users,
      }),
      created = await app.inject({
        body: validBody("Spring Rotation"),
        headers: { cookie: adminCookie },
        method: "POST",
        url: "/admin/rotations",
      });

    expect(created.statusCode).toBe(CREATED);
    const body: {
      endsAt: string | null;
      id: string;
      name: string;
      slug: string;
      startsAt: string;
    } = created.json();
    expect(body).toMatchObject({
      endsAt: "2026-02-01T00:00:00.000Z",
      name: "Spring Rotation",
      startsAt: "2026-01-01T00:00:00.000Z",
    });
    expect(body.id).not.toBe("");
    expect(body.slug).toBe("spring-rotation");
  } finally {
    await app.close();
  }
});

it("Rejects rotation creation for non-admin and unauthenticated callers", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const moderatorCookie = await login({
        app,
        roles: ["moderator"],
        steam,
        steamId: "76561198000002002",
        users,
      }),
      forbidden = await app.inject({
        body: validBody("Moderator Rotation"),
        headers: { cookie: moderatorCookie },
        method: "POST",
        url: "/admin/rotations",
      }),
      unauthenticated = await app.inject({
        body: validBody("Anonymous Rotation"),
        method: "POST",
        url: "/admin/rotations",
      });

    expect(forbidden.statusCode).toBe(FORBIDDEN);
    expect(unauthenticated.statusCode).toBe(UNAUTHORIZED);
  } finally {
    await app.close();
  }
});

it("Returns 404 when updating an unknown rotation as an admin", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002003",
        users,
      }),
      response = await app.inject({
        body: validBody("Renamed Rotation"),
        headers: { cookie: adminCookie },
        method: "PUT",
        url: "/admin/rotations/00000000-0000-4000-8000-000000002003",
      });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toEqual({ message: "rotation not found" });
  } finally {
    await app.close();
  }
});

it("Full-replaces a rotation as an admin", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002004",
        users,
      }),
      createdId = await createRotationId(app, adminCookie, "Initial Rotation"),
      updated = await app.inject({
        body: validBody("Updated Rotation"),
        headers: { cookie: adminCookie },
        method: "PUT",
        url: `/admin/rotations/${createdId}`,
      });

    expect(updated.statusCode).toBe(OK);
    expect(updated.json()).toMatchObject({
      id: createdId,
      name: "Updated Rotation",
      slug: "updated-rotation",
    });
  } finally {
    await app.close();
  }
});

it("Deletes empty rotations and blocks rotations with dependents", async () => {
  const { app, rotations, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002005",
        users,
      }),
      emptyId = await createRotationId(app, adminCookie, "Empty Rotation"),
      dependentsId = await createRotationId(app, adminCookie, "Busy Rotation");

    rotations.markDependents(dependentsId);

    const deletedEmpty = await app.inject({
        headers: { cookie: adminCookie },
        method: "DELETE",
        url: `/admin/rotations/${emptyId}`,
      }),
      blocked = await app.inject({
        headers: { cookie: adminCookie },
        method: "DELETE",
        url: `/admin/rotations/${dependentsId}`,
      });

    expect(deletedEmpty.statusCode).toBe(NO_CONTENT);
    expect(blocked.statusCode).toBe(CONFLICT);
    expect(blocked.json()).toEqual({
      message: "rotation has dependent replays/stats and cannot be deleted",
    });
  } finally {
    await app.close();
  }
});

it("Rejects duplicate names with 409 and bad date ranges with 422", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
      app,
      roles: ["admin"],
      steam,
      steamId: "76561198000002006",
      users,
    });

    await app.inject({
      body: validBody("Unique Rotation"),
      headers: { cookie: adminCookie },
      method: "POST",
      url: "/admin/rotations",
    });

    const duplicate = await app.inject({
        body: validBody("Unique Rotation"),
        headers: { cookie: adminCookie },
        method: "POST",
        url: "/admin/rotations",
      }),
      badRange = await app.inject({
        body: {
          endsAt: "2026-01-01T00:00:00.000Z",
          name: "Bad Range Rotation",
          startsAt: "2026-02-01T00:00:00.000Z",
        },
        headers: { cookie: adminCookie },
        method: "POST",
        url: "/admin/rotations",
      });

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

it("Returns 404 when deleting an unknown rotation as an admin", async () => {
  const { app, steam, users } = await buildAdminApp();
  try {
    const adminCookie = await login({
        app,
        roles: ["admin"],
        steam,
        steamId: "76561198000002007",
        users,
      }),
      response = await app.inject({
        headers: { cookie: adminCookie },
        method: "DELETE",
        url: "/admin/rotations/00000000-0000-4000-8000-000000002007",
      });

    expect(response.statusCode).toBe(NOT_FOUND);
    expect(response.json()).toEqual({ message: "rotation not found" });
  } finally {
    await app.close();
  }
});
