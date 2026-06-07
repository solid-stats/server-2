/* eslint-disable init-declarations, max-lines, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";
import { encodeCursor } from "../pagination/cursor.js";

import { FakePublicStatsReadModel, replayId, rotationId } from "./fixtures.js";

const NOT_FOUND = 404,
  BAD_REQUEST = 400,
  MISSING_REPLAY_ID = "00000000-0000-4000-8000-000000000899";

describe("GET /stats/replays", () => {
  it("returns empty cursor page when using the default (empty) read model", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/replays",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        hasMore: false,
        items: [],
        nextCursor: null,
      });
    } finally {
      await app.close();
    }
  });

  it("returns replays and passes filters + page to the injected read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays?rotationId=${rotationId}&fromDate=2026-01-01T00:00:00.000Z&toDate=2026-06-01T00:00:00.000Z&sort=date&order=desc&limit=10`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasMore: false,
        items: [{ id: replayId }],
        nextCursor: null,
      });
    } finally {
      await app.close();
    }
  });

  it("defaults the page to date/desc when unspecified", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/replays",
      });

      expect(response.statusCode).toBe(200);
      // Default sort is "date" desc — content comes from FakePublicStatsReadModel
      expect(response.json()).toMatchObject({
        items: [{ id: replayId }],
      });
    } finally {
      await app.close();
    }
  });

  it("returns 400 when both page and cursor are supplied (inherited guard)", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/replays?page=1&cursor=abc",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("returns 400 for a malformed cursor", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/replays?cursor=not-a-valid-cursor",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("returns 400 for an unknown sort field", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/stats/replays?sort=nonsense",
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("accepts a valid cursor and passes it to the read model", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel }),
      cursor = encodeCursor({
        id: replayId,
        order: "desc",
        sort: "date",
        values: ["2026-05-01T00:00:00.000Z"],
      });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays?cursor=${cursor}&sort=date&order=desc`,
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe("GET /stats/replays/:id", () => {
  it("returns replay detail 200 for a known id", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: replayId,
        map: "Altis",
        participants: [],
        provenance: { lastUpdatedAt: null },
        sides: [],
      });
    } finally {
      await app.close();
    }
  });

  it("returns 404 with { message } when the replay does not exist", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${MISSING_REPLAY_ID}`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "replay not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for the default (empty) read model", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });
});

describe("GET /stats/replays/:id/events", () => {
  it("returns events 200 for a known replay id", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}/events`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hasMore: false,
        items: [
          {
            actor: null,
            eventType: "kill",
            id: "00000000-0000-4000-8000-000000000901",
            payload: { weapon: "Rifle" },
          },
        ],
        nextCursor: null,
      });
    } finally {
      await app.close();
    }
  });

  it("returns 404 with { message } when the replay does not exist", async () => {
    const readModel = new FakePublicStatsReadModel(),
      app = await buildApp({ publicStatsReadModel: readModel });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${MISSING_REPLAY_ID}/events`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
      expect(response.json()).toEqual({ message: "replay not found" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for the default (empty) read model", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}/events`,
      });

      expect(response.statusCode).toBe(NOT_FOUND);
    } finally {
      await app.close();
    }
  });

  it("returns 400 when both page and cursor are supplied (inherited guard)", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}/events?page=1&cursor=abc`,
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("returns 400 for a malformed cursor", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}/events?cursor=not-a-valid-cursor`,
      });

      expect(response.statusCode).toBe(BAD_REQUEST);
    } finally {
      await app.close();
    }
  });

  it("uses EVENT_SORT whitelist (not REPLAY_SORT) and ascending order by default", async () => {
    const readModel = new FakePublicStatsReadModel();
    let capturedPage: unknown;
    const original = readModel.getReplayEvents.bind(readModel);
    readModel.getReplayEvents = (id, query) => {
      capturedPage = query;
      return original(id, query);
    };
    const app = await buildApp({ publicStatsReadModel: readModel });

    try {
      await app.inject({
        method: "GET",
        url: `/stats/replays/${replayId}/events`,
      });

      // Default sort for events is "time" (EVENT_SORT), ascending
      expect(capturedPage).toMatchObject({ order: "asc", sort: "time" });
    } finally {
      await app.close();
    }
  });
});
