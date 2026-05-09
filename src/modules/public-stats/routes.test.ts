/* eslint-disable no-use-before-define, unicorn/no-null */
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

import {
  page,
  paginated,
  type OverviewFilters,
  type PublicStatsReadModel,
  type StatsOverview,
} from "./routes.js";

const rotationId = "00000000-0000-4000-8000-000000000501";

describe("public stats routes", () => {
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

  it("exports public stats paths through OpenAPI", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
          method: "GET",
          url: "/openapi.json",
        }),
        openapi: { paths: Record<string, unknown> } = response.json();

      expect(openapi.paths).toHaveProperty("/stats/overview");
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

class FakePublicStatsReadModel implements PublicStatsReadModel {
  public lastFilters: OverviewFilters | undefined;

  public getOverview(filters: OverviewFilters): Promise<StatsOverview> {
    this.lastFilters = filters;
    return Promise.resolve({
      filters: {
        rotationId: filters.rotationId ?? null,
      },
      totals: {
        bountyPlayers: 1,
        commanderSides: 1,
        parsedReplays: 3,
        players: 2,
        playerStatRows: 2,
        replays: 3,
        squads: 1,
        squadStatRows: 1,
      },
    });
  }
}
