/**
 * Unit-level route tests for /stats/rotations/:id — slug-or-uuid params,
 * 404 for misses, provenance envelope. Uses FakePublicStatsReadModel.
 * Real-pg slug resolution + provenance assertions live in postgres.test.ts.
 */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel } from "./fixtures.js";

const NOT_FOUND = 404;

describe("GET /stats/rotations/:id — unit route tests", () => {
  it("returns 404 with fixed message when rotation not found", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/rotations/non-existent-slug",
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "rotation not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown UUID (not 500)", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/rotations/00000000-0000-4000-8000-000000009999",
      });

      // FakePublicStatsReadModel.getRotation always returns null
      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});
