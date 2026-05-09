/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, rotationId, squadId } from "./fixtures.js";

const NOT_FOUND = 404;

describe("public squad stats routes", () => {
  it("serves default empty squad pages and squad detail misses", async () => {
    const app = await buildApp();

    try {
      const list = await app.inject({
          method: "GET",
          url: "/stats/squads",
        }),
        detail = await app.inject({
          method: "GET",
          url: `/stats/squads/${squadId}`,
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

  it("passes squad list filters and pagination to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads?rotationId=${rotationId}&search=alpha&page=2&pageSize=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        items: [{ id: squadId, name: "Alpha Squad" }],
        page: 2,
        pageSize: 5,
        total: 1,
      });
      expect(readModel.lastSquadListFilters).toEqual({
        rotationId,
        search: "alpha",
      });
    } finally {
      await app.close();
    }
  });

  it("serves squad pages without rotation filter", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/squads",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        items: [{ rotationId: null }],
      });
      expect(readModel.lastSquadListFilters).toEqual({});
    } finally {
      await app.close();
    }
  });

  it("serves squad profile hits with rotation filter", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${squadId}?rotationId=${rotationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: squadId,
        name: "Alpha Squad",
        players: [{ displayName: "Alpha" }],
        rotationId,
      });
      expect(readModel.lastSquadFilters).toEqual({ rotationId });
    } finally {
      await app.close();
    }
  });

  it("returns not found when injected squad read model misses", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel }),
      missingSquadId = "00000000-0000-4000-8000-000000000599";

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${missingSquadId}`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(readModel.lastSquadFilters).toEqual({});
    } finally {
      await app.close();
    }
  });
});
