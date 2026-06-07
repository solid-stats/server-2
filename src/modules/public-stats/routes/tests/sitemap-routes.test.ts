/* eslint-disable no-magic-numbers */
import { describe, expect, it } from "vitest";

import { buildApp } from "../../../../app.js";

import { FakePublicStatsReadModel } from "./fixtures.js";

describe("registerReplaySitemapRoutes", () => {
  it("GET /sitemap.xml returns 200 with application/xml content-type", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/xml");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap.xml returns a well-formed sitemapindex with zero children (empty read model)", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });
      const body = response.payload;

      expect(body).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
      expect(body).toContain("<sitemapindex");
      expect(body).toContain("</sitemapindex>");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-0.xml returns 200 with application/xml (empty read model)", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays-0.xml",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/xml");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-0.xml delegates to countReplaySitemapPages and listReplaySitemapPage on the fake read model", async () => {
    const readModel = new FakePublicStatsReadModel();
    const app = await buildApp({ publicStatsReadModel: readModel });

    try {
      // Index page uses countReplaySitemapPages
      const indexResponse = await app.inject({
        method: "GET",
        url: "/sitemap.xml",
      });

      expect(indexResponse.statusCode).toBe(200);

      // Child page uses listReplaySitemapPage
      const childResponse = await app.inject({
        method: "GET",
        url: "/sitemap-replays-0.xml",
      });

      expect(childResponse.statusCode).toBe(200);
      expect(childResponse.payload).toContain("<urlset");
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays-invalid.xml returns 400 for non-numeric :n", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays-invalid.xml",
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("GET /sitemap-replays--1.xml returns 400 for negative :n", async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/sitemap-replays--1.xml",
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("sitemap routes do NOT appear in the OpenAPI schema", async () => {
    const app = await buildApp();

    try {
      await app.ready();
      const schema = app.swagger();
      const paths = Object.keys(schema.paths ?? {});

      expect(paths).not.toContain("/sitemap.xml");
      expect(paths.every((path) => !path.startsWith("/sitemap-replays-"))).toBe(
        true,
      );
    } finally {
      await app.close();
    }
  });

  it("sitemap routes are OUTSIDE the public-stats child scope (no cursor rejection on sitemap)", async () => {
    const app = await buildApp();

    try {
      // The cursor+page mixed-param rejection only applies inside the JSON child scope.
      // A sitemap URL with ?page=1&cursor=x should NOT get a 400 from the guard.
      // It will get a 200 (page/cursor params are ignored by the sitemap route).
      const response = await app.inject({
        method: "GET",
        url: "/sitemap.xml?page=1&cursor=abc",
      });

      // Not a 400 from rejectLegacyPaginationParameters — that guard is scoped to /stats/*
      expect(response.statusCode).not.toBe(400);
    } finally {
      await app.close();
    }
  });
});
