/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, playerId, rotationId } from "./fixtures.js";

const NOT_FOUND = 404;

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
      expect(list.json()).toMatchObject({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
      });
      expect(detail.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });

  it("passes player list filters and pagination to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players?rotationId=${rotationId}&search=alpha&page=2&pageSize=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        items: [{ displayName: "Alpha", id: playerId }],
        page: 2,
        pageSize: 5,
        total: 1,
      });
      expect(readModel.lastPlayerListFilters).toEqual({
        rotationId,
        search: "alpha",
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
