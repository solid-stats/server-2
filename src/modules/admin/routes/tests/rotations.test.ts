import { expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import {
  InMemoryAuthUserRepository,
  InMemorySessionStore,
} from "../../../auth/routes/memory.js";
import { FakeRequestSteamAdapter } from "../../../requests/routes/tests/steam.js";
import { InMemoryAdminRotationRepository } from "../memory.js";

const CREATED = 201,
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

async function buildAdminApp() {
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

async function login(input: LoginInput): Promise<string> {
  input.steam.identity = {
    displayName: `Admin Rotation User ${input.steamId}`,
    steamId: input.steamId,
  };
  const callback = await input.app.inject({
      method: "GET",
      url: "/auth/steam/callback",
    }),
    [cookie] = callback.cookies;
  if (cookie === undefined) {
    throw new Error("Expected auth callback to set a session cookie.");
  }
  const users = await input.users.listUsers(),
    user = users.find((candidate) => candidate.steamId === input.steamId);
  if (user === undefined) {
    throw new Error("Expected login to create a user.");
  }
  await input.users.setUserRoles(user.id, input.roles);
  return `${cookie.name}=${cookie.value}`;
}

function validBody(name: string) {
  return {
    endsAt: "2026-02-01T00:00:00.000Z",
    name,
    startsAt: "2026-01-01T00:00:00.000Z",
  };
}

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
      created: { id: string } = (
        await app.inject({
          body: validBody("Initial Rotation"),
          headers: { cookie: adminCookie },
          method: "POST",
          url: "/admin/rotations",
        })
      ).json(),
      updated = await app.inject({
        body: validBody("Updated Rotation"),
        headers: { cookie: adminCookie },
        method: "PUT",
        url: `/admin/rotations/${created.id}`,
      });

    expect(updated.statusCode).toBe(OK);
    expect(updated.json()).toMatchObject({
      id: created.id,
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
      empty: { id: string } = (
        await app.inject({
          body: validBody("Empty Rotation"),
          headers: { cookie: adminCookie },
          method: "POST",
          url: "/admin/rotations",
        })
      ).json(),
      withDependents: { id: string } = (
        await app.inject({
          body: validBody("Busy Rotation"),
          headers: { cookie: adminCookie },
          method: "POST",
          url: "/admin/rotations",
        })
      ).json();

    rotations.markDependents(withDependents.id);

    const deletedEmpty = await app.inject({
        headers: { cookie: adminCookie },
        method: "DELETE",
        url: `/admin/rotations/${empty.id}`,
      }),
      blocked = await app.inject({
        headers: { cookie: adminCookie },
        method: "DELETE",
        url: `/admin/rotations/${withDependents.id}`,
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
