/**
 * Pure, side-effect-free XML builders for the SEO sitemap (REPLAY-04).
 *
 * These functions are intentionally framework-free and unit-testable without
 * starting Fastify. They must be called with already-validated values —
 * escapeXml is applied to every dynamic value so XML-injection is ruled out
 * even if a slug somehow contains special characters (defense-in-depth;
 * slugs are additionally restricted to `^[A-Za-z0-9-]+$` by the schema).
 *
 * References: sitemaps.org/protocol.html — 50,000 URLs per child sitemap,
 * `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`, absolute `<loc>` URLs.
 */

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XML_DECLARATION = `<?xml version="1.0" encoding="UTF-8"?>`;

/** Maximum URLs per child sitemap (sitemaps.org protocol limit). */
export const SITEMAP_PAGE_SIZE = 50_000;

/**
 * Escape the five XML predefined entities in a dynamic string value.
 * Order: `&` must be replaced before the others to avoid double-escaping.
 */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(`"`, "&quot;")
    .replaceAll("'", "&apos;");
}

function replayUrlEntry(slug: string, baseUrl: string): string {
  return `  <url><loc>${escapeXml(`${baseUrl}/replays/${slug}`)}</loc></url>`;
}

function childSitemapEntry(pageIndex: number, baseUrl: string): string {
  return `  <sitemap><loc>${escapeXml(`${baseUrl}/sitemap-replays-${String(pageIndex)}.xml`)}</loc></sitemap>`;
}

/**
 * Build a sitemaps.org 0.9 `<urlset>` document listing one replay URL per
 * slug under `baseUrl`. Slugs with null values must have been filtered before
 * this call (the repository's `listReplaySitemapPage` does that).
 *
 * @param slugs - Non-null replay slugs for this page.
 * @param baseUrl - The public base URL (e.g. `https://solidstats.com`).
 */
export function urlsetXml(slugs: string[], baseUrl: string): string {
  const urls = slugs.map((slug) => replayUrlEntry(slug, baseUrl)).join("\n");
  return `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NS}">\n${urls}\n</urlset>\n`;
}

/**
 * Build a sitemaps.org 0.9 `<sitemapindex>` document listing one child
 * sitemap per page of ≤ {@link SITEMAP_PAGE_SIZE} replays.
 *
 * @param pageCount - Total number of child sitemaps (0 → empty index).
 * @param baseUrl - The public base URL.
 */
export function sitemapIndexXml(pageCount: number, baseUrl: string): string {
  const entries = Array.from({ length: pageCount }, (_unused, pageIndex) =>
    childSitemapEntry(pageIndex, baseUrl),
  ).join("\n");
  return `${XML_DECLARATION}\n<sitemapindex xmlns="${SITEMAP_NS}">\n${entries}\n</sitemapindex>\n`;
}
