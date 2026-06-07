import { describe, expect, it } from "vitest";

import {
  SITEMAP_PAGE_SIZE,
  escapeXml,
  sitemapIndexXml,
  urlsetXml,
} from "./sitemap.js";

describe("escapeXml", () => {
  it("escapes all five XML entities", () => {
    expect(escapeXml(`a&b<c>"d'e`)).toBe(
      "a&amp;b&lt;c&gt;&quot;d&apos;e",
    );
  });

  it("escapes & before <", () => {
    // Order matters: & must be escaped before < and > to avoid double-escaping
    expect(escapeXml("&<>")).toBe("&amp;&lt;&gt;");
  });

  it("is a no-op on a safe string", () => {
    expect(escapeXml("hello-world-123")).toBe("hello-world-123");
  });

  it("handles an empty string", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("SITEMAP_PAGE_SIZE", () => {
  it("is exactly 50000", () => {
    expect(SITEMAP_PAGE_SIZE).toBe(50_000);
  });
});

describe("urlsetXml", () => {
  it("emits an XML declaration and the sitemaps.org 0.9 namespace", () => {
    const result = urlsetXml([], "https://x.test");

    expect(result).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(result).toContain(`xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`);
  });

  it("emits a valid empty urlset (no url children) for an empty slug list", () => {
    const result = urlsetXml([], "https://x.test");

    expect(result).toContain("<urlset");
    expect(result).toContain("</urlset>");
    expect(result).not.toContain("<url>");
  });

  it("emits one <url><loc> entry per slug with the base url prefix", () => {
    const result = urlsetXml(["alpha", "beta"], "https://x.test");

    expect(result).toContain(
      "<url><loc>https://x.test/replays/alpha</loc></url>",
    );
    expect(result).toContain(
      "<url><loc>https://x.test/replays/beta</loc></url>",
    );
  });

  it("XML-escapes the base url in each loc", () => {
    // A base URL containing & must be escaped inside <loc>
    const result = urlsetXml(["slug1"], "https://x.test?a=1&b=2");

    expect(result).toContain("https://x.test?a=1&amp;b=2/replays/slug1");
    expect(result).not.toContain("&b=2");
  });
});

describe("sitemapIndexXml", () => {
  it("emits an XML declaration and the sitemaps.org 0.9 namespace", () => {
    const result = sitemapIndexXml(1, "https://x.test");

    expect(result).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(result).toContain(
      `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
    );
  });

  it("emits a valid empty sitemapindex for pageCount = 0", () => {
    const result = sitemapIndexXml(0, "https://x.test");

    expect(result).toContain("<sitemapindex");
    expect(result).toContain("</sitemapindex>");
    expect(result).not.toContain("<sitemap>");
  });

  it("emits child sitemap locs for pageCount = 3 (0-based: 0,1,2)", () => {
    const result = sitemapIndexXml(3, "https://x.test");

    expect(result).toContain(
      "<sitemap><loc>https://x.test/sitemap-replays-0.xml</loc></sitemap>",
    );
    expect(result).toContain(
      "<sitemap><loc>https://x.test/sitemap-replays-1.xml</loc></sitemap>",
    );
    expect(result).toContain(
      "<sitemap><loc>https://x.test/sitemap-replays-2.xml</loc></sitemap>",
    );
  });

  it("XML-escapes the base url in child sitemap locs", () => {
    const result = sitemapIndexXml(1, "https://x.test?a=1&b=2");

    expect(result).toContain("https://x.test?a=1&amp;b=2/sitemap-replays-0.xml");
  });
});
