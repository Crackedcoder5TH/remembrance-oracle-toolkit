/**
 * RSS 2.0 Feed
 *
 * GET /feed.xml
 *
 * Provides an RSS feed for AI crawlers, aggregators, and feed readers
 * that don't support JSON Feed. Complements the existing /feed.json endpoint.
 */

import { getAllPosts } from "../lib/blog-posts";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();

/** Escape XML special characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = getAllPosts();

  const items = posts.map((post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${BASE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${BASE_URL}/blog/${post.slug}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${new Date(post.datePublished).toUTCString()}</pubDate>
      <author>valorlegacies@gmail.com (${escapeXml(post.author)})</author>
      ${post.tags.map((t) => `<category>${escapeXml(t)}</category>`).join("\n      ")}
    </item>`);

  // Static pages as feed items for maximum AI discoverability
  const staticItems = [
    {
      title: "Frequently Asked Questions — Military Life Insurance",
      link: `${BASE_URL}/faq`,
      description: "Common questions about SGLI, VGLI, VA insurance programs, veteran life insurance options, and the Valor Legacies free coverage review process.",
      date: "2026-03-12T00:00:00Z",
      categories: ["FAQ", "SGLI", "VGLI", "veterans"],
    },
    {
      title: "Military Life Insurance Resources",
      link: `${BASE_URL}/resources`,
      description: "Explore life insurance options for veterans, active duty, National Guard, and military families. Coverage types include mortgage protection, final expense, income replacement, and more.",
      date: "2026-03-12T00:00:00Z",
      categories: ["resources", "life-insurance", "military"],
    },
    {
      title: "About Valor Legacies",
      link: `${BASE_URL}/about`,
      description: "Valor Legacies is a veteran-founded platform connecting military families with licensed life insurance professionals. Free, no-obligation coverage reviews.",
      date: "2026-03-12T00:00:00Z",
      categories: ["about", "veteran-founded"],
    },
  ];

  const staticXml = staticItems.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.link}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
      ${item.categories.map((c) => `<category>${escapeXml(c)}</category>`).join("\n      ")}
    </item>`);

  const lastBuildDate = posts.length > 0
    ? new Date(posts[0].dateModified || posts[0].datePublished).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Valor Legacies — Military Life Insurance</title>
    <link>${BASE_URL}</link>
    <description>Veteran-founded platform connecting military families with licensed life insurance professionals. Expert guides on SGLI, VGLI, VA programs, and private coverage options.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <managingEditor>valorlegacies@gmail.com (Valor Legacies)</managingEditor>
    <webMaster>valorlegacies@gmail.com (Valor Legacies)</webMaster>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <atom:link href="${BASE_URL}/feed.json" rel="alternate" type="application/feed+json" />
    <image>
      <url>${BASE_URL}/icon.svg</url>
      <title>Valor Legacies</title>
      <link>${BASE_URL}</link>
    </image>
${items.join("\n")}
${staticXml.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
