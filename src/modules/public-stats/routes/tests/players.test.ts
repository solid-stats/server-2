/* eslint-disable max-lines, max-lines-per-function, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, playerId, rotationId } from "./fixtures.js";

const NOT_FOUND = 404,
  BAD_REQUEST = 400,
  SERVER_ERROR = 500,
  SORT_VALUE = 3;

describe("public player stats routes", () => {
  it("serves default empty player pages and player detail misses", async () => {
    const app = await buildApp();

    try {
      const list = await app.inject({
          method: "GET",
          url: "/stats/players",
        }),
        detail = await app.inject({
          method: "GET",
          url: `/stats/players/${playerId}`,
        });

      expect(list.statusCode).toBe(200);
      expect(list.json()).toEqual({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      expect(detail.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });

  it("passes player list filters and the resolved page to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players?rotationId=${rotationId}&search=alpha&sort=name&order=asc&limit=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasMore: false,
        items: [{ displayName: "Alpha", id: playerId }],
        nextCursor: null,
      });
      expect(readModel.lastPlayerListFilters).toEqual({
        rotationId,
        search: "alpha",
      });
      expect(readModel.lastPlayerListPage).toEqual({
        limit: 5,
        order: "asc",
        sort: "name",
      });
    } finally {
      await app.close();
    }
  });

  it("defaults the page to the endpoint sort/order when unspecified", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      await app.inject({ method: "GET", url: "/stats/players" });

      expect(readModel.lastPlayerListPage).toEqual({
        limit: 25,
        order: "desc",
        sort: "kills",
      });
    } finally {
      await app.close();
    }
  });

  it("serves player pages without rotation filter", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/players",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        items: [{ rotationId: null }],
      });
      expect(readModel.lastPlayerListFilters).toEqual({});
    } finally {
      await app.close();
    }
  });

  it("serves player profile hits with rotation filter", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}?rotationId=${rotationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        aliases: ["Alpha"],
        displayName: "Alpha",
        id: playerId,
        rotationId,
      });
      expect(readModel.lastPlayerFilters).toEqual({ rotationId });
    } finally {
      await app.close();
    }
  });

  it("returns not found when injected player read model misses", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel }),
      missingPlayerId = "00000000-0000-4000-8000-000000000599";

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${missingPlayerId}`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(readModel.lastPlayerFilters).toEqual({});
    } finally {
      await app.close();
    }
  });
});

describe("public player stats pagination guards", () => {
  it("rejects a request supplying both page and cursor with 400", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/players?page=2&cursor=abc",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("rejects a leftover page or pageSize param with 400", async () => {
    const app = await buildApp();

    try {
      const withPage = await app.inject({
          method: "GET",
          url: "/stats/players?page=2",
        }),
        withPageSize = await app.inject({
          method: "GET",
          url: "/stats/players?pageSize=5",
        });

      expect(withPage.statusCode).toBe(BAD_REQUEST);
      expect(withPageSize.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("rejects an unknown sort field with 400", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/players?sort=nonsense",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("rejects a cursor whose encoded sort/order differs from the request with 400", async () => {
    const app = await buildApp(),
      // cursor encodes sort=kills/order=desc; request asks order=asc -> drift.
      mismatchedCursor = Buffer.from(
        JSON.stringify({
          id: playerId,
          order: "desc",
          sort: "kills",
          values: [SORT_VALUE],
        }),
        "utf8",
      ).toString("base64url");

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players?sort=kills&order=asc&cursor=${mismatchedCursor}`,
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("rejects a malformed cursor with 400", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/players?cursor=not-a-valid-cursor",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("re-throws a non-cursor error (not mapped to 400) so it surfaces as 500", async () => {
    // The public-stats error handler maps only BadCursorError to 400; any other
    // error is re-thrown to the default handler -> 500. A read model that throws
    // a plain Error exercises that re-throw branch.
    const readModel = new FakePublicStatsReadModel();
    readModel.listPlayers = (): Promise<never> =>
      Promise.reject(new Error("boom"));
    const app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/players",
      });

      expect(response.statusCode).toBe(SERVER_ERROR);
    } finally {
      await app.close();
    }
  });
});

describe("player parity sub-resource routes", () => {
  const missingPlayerId = "00000000-0000-4000-8000-000000000599";

  it("GET /stats/players/:id/weapons returns 200 with firearms/vehicles for known player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/weapons`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        firearms: [],
        provenance: { lastUpdatedAt: null },
        vehicles: [],
      });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/weapons returns 404 with fixed message for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${missingPlayerId}/weapons`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/vehicles returns 200 with vehicle stats for known player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/vehicles`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        killsFromVehicle: 0,
        vehicleKills: 0,
        vehicles: [],
      });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/vehicles returns 404 for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${missingPlayerId}/vehicles`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/relationships returns 200 with four lists for known player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/relationships`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        killed: [],
        killers: [],
        provenance: { lastUpdatedAt: null },
        teamkilled: [],
        teamkillers: [],
      });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/relationships returns 404 for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${missingPlayerId}/relationships`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/weekly returns 200 with weeks for known player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/weekly`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        provenance: { lastUpdatedAt: null },
        weeks: [],
      });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/players/:id/weekly returns 404 for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${missingPlayerId}/weekly`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });
});

describe("player parity sub-resources with default (empty) read model", () => {
  it("returns 404 for weapons/vehicles/relationships/weekly when no read model is injected", async () => {
    const app = await buildApp();

    try {
      const [weapons, vehicles, relationships, weekly] = await Promise.all([
        app.inject({
          method: "GET",
          url: `/stats/players/${playerId}/weapons`,
        }),
        app.inject({
          method: "GET",
          url: `/stats/players/${playerId}/vehicles`,
        }),
        app.inject({
          method: "GET",
          url: `/stats/players/${playerId}/relationships`,
        }),
        app.inject({
          method: "GET",
          url: `/stats/players/${playerId}/weekly`,
        }),
      ]);

      expect(weapons.statusCode).toBe(NOT_FOUND);
      expect(vehicles.statusCode).toBe(NOT_FOUND);
      expect(relationships.statusCode).toBe(NOT_FOUND);
      expect(weekly.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});
