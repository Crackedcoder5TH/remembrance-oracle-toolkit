import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * Domain-aware robots.txt
 *
 * On leads domains: disallow /admin and /portal entirely (they don't exist here).
 * On portal domain: disallow indexing of admin/portal (private), allow public pages.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();
  const portalDomain = (process.env.PORTAL_DOMAIN || "").trim().toLowerCase();

  // Detect current domain from request headers
  let isPortal = false;
  try {
    const headersList = headers();
    const host = (headersList.get("host") || "").toLowerCase().split(":")[0];
    isPortal = !!(portalDomain && host === portalDomain);
  } catch {
    // headers() unavailable during build — use defaults
  }

  if (isPortal) {
    // Portal domain: block admin/portal from search engines, allow public pages
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/admin", "/portal", "/api/admin/", "/api/portal/", "/api/client/"],
        },
      ],
      sitemap: `https://${portalDomain}/sitemap.xml`,
    };
  }

  // Leads domains: no admin/portal routes exist, block them entirely
  return {
    rules: [
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
