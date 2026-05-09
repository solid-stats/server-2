/* eslint-disable no-use-before-define, unicorn/no-null */
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

import {
  page,
  paginated,
  type OverviewFilters,
  type PageQuery,
  type PaginatedResult,
  type PlayerListFilters,
  type PlayerProfile,
  type PlayerSummary,
  type PublicStatsReadModel,
  type RotationFilters,
  type StatsOverview,
} from "./routes.js";

const playerId = "00000000-0000-4000-8000-000000000502",
  NOT_FOUND = 404,
  rotationId = "00000000-0000-4000-8000-000000000501";

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
      expect(openapi.paths).toHaveProperty("/stats/players");
      expect(openapi.paths).toHaveProperty("/stats/players/{id}");
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
});

class FakePublicStatsReadModel implements PublicStatsReadModel {
  public lastFilters: OverviewFilters | undefined;

  public lastPlayerFilters: RotationFilters | undefined;

  public lastPlayerListFilters: PlayerListFilters | undefined;

  public getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null> {
    this.lastPlayerFilters = filters;
    return Promise.resolve(id === playerId ? playerProfile(filters) : null);
  }

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

  public listPlayers(
    filters: PlayerListFilters,
    query: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>> {
    this.lastPlayerListFilters = filters;
    return Promise.resolve({
      items: [playerProfile(filters)],
      page: query.page,
      pageSize: query.pageSize,
      total: 1,
    });
  }
}

function playerProfile(filters: RotationFilters): PlayerProfile {
  return {
    aliases: ["Alpha"],
    displayName: "Alpha",
    id: playerId,
    rotationId: filters.rotationId ?? null,
    stats: {
      deaths: {
        byTeamkills: 0,
        total: 1,
      },
      kills: 3,
      replayCount: 2,
      teamkills: 0,
    },
    steamIds: ["steam-a"],
  };
}
