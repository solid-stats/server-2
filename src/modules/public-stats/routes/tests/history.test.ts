/**
 * Unit-level route tests for history sub-resources:
 *   GET /stats/players/:id/name-history
 *   GET /stats/players/:id/membership-history
 *   GET /stats/squads/:id/membership-history
 *
 * Uses FakePublicStatsReadModel for schema/status-code validation.
 * Real-pg integration coverage (ordering, gaps, provenance, Steam64)
 * lives in postgres.test.ts.
 */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel, playerId, squadId } from "./fixtures.js";

const NOT_FOUND = 404;

// A player/squad that the FakePublicStatsReadModel won't recognise (always null)
const MISSING_ID = "00000000-0000-4000-8000-000000000599";

describe("GET /stats/players/:id/name-history — route schema and 404", () => {
  it("returns 404 for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${MISSING_ID}/name-history`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for any player (FakePublicStatsReadModel.getPlayerNameHistory always returns null)", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/name-history`,
      });

      // The fake always returns null → route sends 404
      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});

describe("GET /stats/players/:id/membership-history — route schema and 404", () => {
  it("returns 404 for unknown player", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${MISSING_ID}/membership-history`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "player not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for any player (FakePublicStatsReadModel.getPlayerMembershipHistory always returns null)", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/players/${playerId}/membership-history`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});

describe("GET /stats/squads/:id/membership-history — route schema and 404", () => {
  it("returns 404 for unknown squad", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${MISSING_ID}/membership-history`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "squad not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for any squad (FakePublicStatsReadModel.getSquadMembershipHistory always returns null)", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/squads/${squadId}/membership-history`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});
