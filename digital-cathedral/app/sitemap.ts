import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { GUIDES } from "./guides/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const leadsBaseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com"
  )
    .split(",")[0]
    .trim();
  const primaryDomain = (process.env.PRIMARY_DOMAIN || "valorlegacies.com")
    .trim()
    .toLowerCase();
  const portalDomain =
    (process.env.PORTAL_DOMAIN || "").trim().toLowerCase() ||
    (primaryDomain.endsWith(".com") ? `${primaryDomain.slice(0, -4)}.xyz` : "");

  // Detect current domain to serve the right sitemap
  let isPortal = false;
  try {
    const headersList = headers();
    const host = (headersList.get("host") || "").toLowerCase().split(":")[0];
    isPortal = !!(portalDomain && host === portalDomain);
  } catch {
    // headers() unavailable during build — use leads default
  }

  const baseUrl = isPortal ? `https://${portalDomain}` : leadsBaseUrl;

  const staticRoutes: MetadataRoute.Sitemap = isPortal
    ? [
        {
          url: `${baseUrl}/portal`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.7,
        },
        {
          url: `${baseUrl}/portal/marketplace`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.7,
        },
        {
          url: `${baseUrl}/portal/privacy`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.4,
        },
        {
          url: `${baseUrl}/portal/terms`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.4,
        },
      ]
    : [
        {
          url: baseUrl,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 1,
        },
        {
          url: `${baseUrl}/about`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.7,
        },
        {
          url: `${baseUrl}/faq`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.8,
        },
        {
          url: `${baseUrl}/privacy`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.5,
        },
        {
          url: `${baseUrl}/terms`,
          lastModified: new Date(),
          changeFrequency: "monthly",
          priority: 0.5,
        },
        {
          url: `${baseUrl}/feed.json`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.5,
        },
      ];

  // Dynamic resource/landing page routes
  const resourceRoutes: MetadataRoute.Sitemap = isPortal
    ? []
    : [
        {
          url: `${baseUrl}/resources`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.8,
        },
        {
          url: `${baseUrl}/guides`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        },
        ...GUIDES.map((guide) => ({
          url: `${baseUrl}/guides/${guide.slug}`,
          lastModified: new Date(),
          changeFrequency: "monthly" as const,
          priority: 0.75,
        })),
      ];

  return [...staticRoutes, ...resourceRoutes];
}
