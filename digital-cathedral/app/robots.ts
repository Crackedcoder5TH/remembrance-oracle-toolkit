/**
 * Robots.txt — The Kingdom's Crawl Instructions
 *
 * Oracle decision: GENERATE (0.381) — no existing pattern, write new
 *
 * Tells search engines which pages to crawl and where the sitemap lives.
 * Blocks /admin and /api routes from public indexing.
 */

import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
