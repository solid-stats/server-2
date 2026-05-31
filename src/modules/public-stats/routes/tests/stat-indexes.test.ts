/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, rotationId } from "./fixtures.js";

const BAD_REQUEST = 400;

describe("public rotation and aggregate index routes", () => {
  it("serves default empty rotation, commander, bounty, and leaderboard indexes", async () => {
    const app = await buildApp();

    try {
      const rotations = await app.inject({
          method: "GET",
          url: "/stats/rotations",
        }),
        commanders = await app.inject({
          method: "GET",
          url: "/stats/commander-sides",
        }),
        bounty = await app.inject({
          method: "GET",
          url: "/stats/bounty",
        }),
        leaderboards = await app.inject({
          method: "GET",
          url: "/stats/leaderboards",
        });

      expect(rotations.json()).toEqual([]);
      expect(commanders.json()).toEqual([]);
      expect(bounty.json()).toEqual({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
      expect(leaderboards.json()).toEqual({
        bounty: { hasMore: false, items: [], nextCursor: null },
        playersByKills: { hasMore: false, items: [], nextCursor: null },
        rotationId: null,
        squadsByKills: { hasMore: false, items: [], nextCursor: null },
      });
    } finally {
      await app.close();
    }
  });

  it("serves rotation summaries from the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/rotations",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          endsAt: null,
          id: rotationId,
          name: "Rotation 1",
          startsAt: "2026-05-01T00:00:00.000Z",
        },
      ]);
      expect(readModel.listedRotations).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe("public aggregate index routes", () => {
  it("passes rotation filter to commander-side stats", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/commander-sides?rotationId=${rotationId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([
        {
          knownLosses: 1,
          knownWins: 2,
          player: { displayName: "Alpha" },
          rotationId,
          side: "west",
          unknownOutcomes: 1,
        },
      ]);
      expect(readModel.lastCommanderFilters).toEqual({ rotationId });
    } finally {
      await app.close();
    }
  });

  it("serves aggregate indexes without rotation filters", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const commanders = await app.inject({
          method: "GET",
          url: "/stats/commander-sides",
        }),
        bounty = await app.inject({
          method: "GET",
          url: "/stats/bounty",
        }),
        leaderboards = await app.inject({
          method: "GET",
          url: "/stats/leaderboards",
        });

      expect(commanders.json()).toMatchObject([{ rotationId }]);
      expect(bounty.json()).toMatchObject({
        items: [{ rotationId }],
      });
      expect(leaderboards.json()).toMatchObject({
        bounty: { items: [{ rotationId }] },
        rotationId: null,
      });
      expect(readModel.lastCommanderFilters).toEqual({});
      expect(readModel.lastBountyFilters).toEqual({});
      expect(readModel.lastLeaderboardFilters).toEqual({ limit: 10 });
    } finally {
      await app.close();
    }
  });

  it("passes bounty filters and the resolved page to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/bounty?rotationId=${rotationId}&order=asc&limit=5`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasMore: false,
        items: [{ player: { displayName: "Alpha" }, points: 7.5 }],
        nextCursor: null,
      });
      expect(readModel.lastBountyFilters).toEqual({ rotationId });
      expect(readModel.lastBountyPage).toEqual({
        limit: 5,
        order: "asc",
        sort: "points",
      });
    } finally {
      await app.close();
    }
  });

  it("rejects leftover page/pageSize on the bounty list with 400", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/bounty?page=2&pageSize=5",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("passes leaderboard filters to the injected read model and paginates each surface", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/leaderboards?rotationId=${rotationId}&limit=3`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        bounty: { hasMore: false, items: [{ points: 7.5 }], nextCursor: null },
        playersByKills: { items: [{ displayName: "Alpha" }] },
        rotationId,
        squadsByKills: { items: [{ name: "Alpha Squad" }] },
      });
      expect(readModel.lastLeaderboardFilters).toEqual({
        limit: 3,
        rotationId,
      });
    } finally {
      await app.close();
    }
  });
});
