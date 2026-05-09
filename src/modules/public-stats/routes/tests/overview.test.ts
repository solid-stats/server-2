/* eslint-disable unicorn/no-null */
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import { page } from "../routes.js";
import { paginated } from "../schemas.js";

import { FakePublicStatsReadModel, rotationId } from "./fixtures.js";

describe("public stats overview route", () => {
  it("serves the default anonymous overview response", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/overview",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        filters: { rotationId: null },
        totals: {
          bountyPlayers: 0,
          commanderSides: 0,
          parsedReplays: 0,
          players: 0,
          playerStatRows: 0,
          replays: 0,
          squads: 0,
          squadStatRows: 0,
        },
      });
    } finally {
      await app.close();
    }
  });

  it("passes rotation filter to the injected public stats read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/overview?rotationId=${rotationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        filters: { rotationId },
        totals: { players: 2, replays: 3 },
      });
      expect(readModel.lastFilters).toEqual({ rotationId });
    } finally {
      await app.close();
    }
  });

  it("passes empty filters to the injected public stats read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/overview",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        filters: { rotationId: null },
      });
      expect(readModel.lastFilters).toEqual({});
    } finally {
      await app.close();
    }
  });
});

describe("public stats route schemas", () => {
  it("exports public stats paths through OpenAPI", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
          method: "GET",
          url: "/openapi.json",
        }),
        openapi: { paths: Record<string, unknown> } = response.json();

      expect(openapi.paths).toHaveProperty("/stats/overview");
      expect(openapi.paths).toHaveProperty("/stats/players");
      expect(openapi.paths).toHaveProperty("/stats/players/{id}");
      expect(openapi.paths).toHaveProperty("/stats/squads");
      expect(openapi.paths).toHaveProperty("/stats/squads/{id}");
    } finally {
      await app.close();
    }
  });

  it("builds shared pagination responses and query values for list endpoints", () => {
    const schema = paginated(Type.Object({ id: Type.String() }));

    expect(Object.keys(schema.properties)).toEqual([
      "items",
      "page",
      "pageSize",
      "total",
    ]);
    expect(page({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });
});
