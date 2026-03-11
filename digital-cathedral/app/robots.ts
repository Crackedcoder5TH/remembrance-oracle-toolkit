import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();

  return {
    rules: [
      // Default: allow public pages, block admin/portal internals
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/portal", "/api/admin/", "/api/portal/", "/api/client/"],
      },
      // AI Crawlers: explicitly welcome — allow agent discovery endpoints
      {
        userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "Google-Extended", "PerplexityBot", "Amazonbot", "cohere-ai"],
        allow: ["/", "/api/agent/schema", "/llms.txt", "/.well-known/"],
        disallow: ["/admin", "/portal", "/api/admin/", "/api/portal/", "/api/client/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
