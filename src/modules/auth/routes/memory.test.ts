import { describe, expect, it, vi } from "vitest";

import { InMemoryAuthUserRepository, InMemorySessionStore } from "./memory.js";

const EXPIRED_SESSION_ELAPSED_MS = 1001;

describe("InMemoryAuthUserRepository", () => {
  it("updates existing Steam users when the display name changes", async () => {
    const repository = new InMemoryAuthUserRepository(),
      created = await repository.upsertSteamUser({
        displayName: "Old",
        steamId: "steam-1",
      }),
      updated = await repository.upsertSteamUser({
        displayName: "New",
        steamId: "steam-1",
      });

    expect(updated).toMatchObject({
      displayName: "New",
      id: created.id,
      steamId: "steam-1",
    });
    await expect(repository.findById(created.id)).resolves.toMatchObject({
      displayName: "New",
    });
    await expect(repository.findById("missing")).resolves.toBeNull();
  });

  it("keeps bootstrap admin role when roles are updated", async () => {
    const repository = new InMemoryAuthUserRepository("steam-admin"),
      user = await repository.upsertSteamUser({
        displayName: "Admin",
        steamId: "steam-admin",
      }),
      updated = await repository.setUserRoles(user.id, ["moderator", "admin"]);

    expect(user.roles).toEqual(["admin"]);
    expect(updated?.roles).toEqual(["admin", "moderator"]);
    await expect(repository.listUsers()).resolves.toMatchObject([
      {
        id: user.id,
        roles: ["admin", "moderator"],
      },
    ]);
  });

  it("lists users by display name", async () => {
    const repository = new InMemoryAuthUserRepository();

    await repository.upsertSteamUser({
      displayName: "Zulu",
      steamId: "steam-z",
    });
    await repository.upsertSteamUser({
      displayName: "Alpha",
      steamId: "steam-a",
    });

    await expect(repository.listUsers()).resolves.toMatchObject([
      { displayName: "Alpha" },
      { displayName: "Zulu" },
    ]);
  });
});

describe("InMemorySessionStore", () => {
  it("returns null and deletes sessions after expiry", async () => {
    vi.useFakeTimers();
    try {
      const store = new InMemorySessionStore(),
        session = await store.create("user-1", 1);

      vi.advanceTimersByTime(EXPIRED_SESSION_ELAPSED_MS);

      await expect(store.get(session.id)).resolves.toBeNull();
      await expect(store.get(session.id)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
