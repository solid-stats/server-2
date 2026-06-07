/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, rotationId, squadId } from "./fixtures.js";

const NOT_FOUND = 404,
  BAD_REQUEST = 400;

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

  it("passes squad list filters and the resolved page to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads?rotationId=${rotationId}&search=alpha&sort=name&order=asc&limit=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasMore: false,
        items: [{ id: squadId, name: "Alpha Squad" }],
        nextCursor: null,
      });
      expect(readModel.lastSquadListFilters).toEqual({
        rotationId,
        search: "alpha",
      });
      expect(readModel.lastSquadListPage).toEqual({
        limit: 5,
        order: "asc",
        sort: "name",
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

describe("squad parity sub-resource routes (PARITY-06)", () => {
  const missingSquadId = "00000000-0000-4000-8000-000000000599";

  it("GET /stats/squads/:id/weapons returns 200 with firearms/vehicles for known squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${squadId}/weapons`,
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

  it("GET /stats/squads/:id/weapons returns 404 with fixed message for unknown squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${missingSquadId}/weapons`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "squad not found" });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/squads/:id/relationships returns 200 with four lists for known squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${squadId}/relationships`,
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

  it("GET /stats/squads/:id/relationships returns 404 for unknown squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${missingSquadId}/relationships`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "squad not found" });
    } finally {
      await app.close();
    }
  });

  it("GET /stats/squads/:id/weekly returns 200 with weeks array for known squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${squadId}/weekly`,
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

  it("GET /stats/squads/:id/weekly returns 404 for unknown squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${missingSquadId}/weekly`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "squad not found" });
    } finally {
      await app.close();
    }
  });
});

describe("squad parity sub-resources with default (empty) read model", () => {
  it("returns 404 for weapons/relationships/weekly when no read model is injected", async () => {
    const app = await buildApp();

    try {
      const [weapons, relationships, weekly] = await Promise.all([
        app.inject({ method: "GET", url: `/stats/squads/${squadId}/weapons` }),
        app.inject({
          method: "GET",
          url: `/stats/squads/${squadId}/relationships`,
        }),
        app.inject({ method: "GET", url: `/stats/squads/${squadId}/weekly` }),
      ]);

      expect(weapons.statusCode).toBe(NOT_FOUND);
      expect(relationships.statusCode).toBe(NOT_FOUND);
      expect(weekly.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});

describe("public squad stats pagination guards", () => {
  it("rejects mixed page+cursor, leftover page/pageSize, and unknown sort with 400", async () => {
    const app = await buildApp();

    try {
      const mixed = await app.inject({
          method: "GET",
          url: "/stats/squads?page=2&cursor=abc",
        }),
        leftover = await app.inject({
          method: "GET",
          url: "/stats/squads?pageSize=5",
        }),
        unknownSort = await app.inject({
          method: "GET",
          url: "/stats/squads?sort=nonsense",
        });

      expect(mixed.statusCode).toBe(BAD_REQUEST);
      expect(leftover.statusCode).toBe(BAD_REQUEST);
      expect(unknownSort.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });
});
