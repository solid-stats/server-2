/**
 * Fastify plugin that serves SEO sitemaps (REPLAY-04).
 *
 * Registered as a SEPARATE top-level plugin in `buildApp` — intentionally
 * OUTSIDE the public-stats JSON child scope — so these routes do NOT inherit:
 * - `rejectLegacyPaginationParameters` preValidation
 * - `BadCursorError → 400` error handler
 *
 * These routes carry NO TypeBox `response` schema, which means they are
 * absent from the OpenAPI contract (`pnpm run openapi:check` must confirm 0
 * sitemap paths in the JSON). They respond with `application/xml` only.
 *
 * Security: T-17-10 (XML injection via slug) and T-17-11 (:n → SQL) are
 * mitigated here: escapeXml is applied inside the builders to every dynamic
 * value; :n is parsed and validated before passing to the read model.
 */

import { sitemapIndexXml, urlsetXml } from "./sitemap.js";

import type { PublicStatsReadModel } from "./models.js";
import type { FastifyInstance } from "fastify";

export interface ReplaySitemapRouteOptions {
  baseUrl: string;
  readModel: PublicStatsReadModel;
}

const BAD_REQUEST = 400;

export async function registerReplaySitemapRoutes(
  app: FastifyInstance,
  options: ReplaySitemapRouteOptions,
): Promise<void> {
  /**
   * Sitemap index — one entry per child page of ≤ 50,000 replay slugs.
   * Returns `application/xml`. `schema.hide: true` excludes this route from
   * the OpenAPI contract (T-17-13 — sitemap routes must not pollute the JSON
   * contract consumed by `web`).
   */
  app.get(
    "/sitemap.xml",
    { schema: { hide: true } },
    async (_request, reply) => {
      const pageCount = await options.readModel.countReplaySitemapPages();

      return reply
        .type("application/xml")
        .send(sitemapIndexXml(pageCount, options.baseUrl));
    },
  );

  /**
   * Child sitemap page — up to 50,000 replay slug URLs.
   * `:n` is 0-based. A non-numeric or negative value returns 400.
   * `schema.hide: true` excludes this route from the OpenAPI contract.
   */
  app.get<{ Params: { n: string } }>(
    "/sitemap-replays-:n.xml",
    { schema: { hide: true } },
    async (request, reply) => {
      const raw = request.params.n;

      // Require a canonical non-negative decimal integer string.
      // /^\d+$/ rejects exponential (1e3), hex (0x10), signed (+5), and
      // whitespace-padded forms that Number() silently accepts, preventing
      // an unbounded OFFSET from being computed in the repository.
      if (!/^\d+$/u.test(raw)) {
        return reply
          .code(BAD_REQUEST)
          .send({ message: "Invalid sitemap page number" });
      }
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed)) {
        return reply
          .code(BAD_REQUEST)
          .send({ message: "Invalid sitemap page number" });
      }

      const slugs = await options.readModel.listReplaySitemapPage(parsed);

      return reply
        .type("application/xml")
        .send(urlsetXml(slugs, options.baseUrl));
    },
  );
}
