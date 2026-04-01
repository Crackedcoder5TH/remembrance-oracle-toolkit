import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAllPosts } from "./lib/blog-posts";
import { getAllLandingPages } from "./lib/landing-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const leadsBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();
  const portalDomain = (process.env.PORTAL_DOMAIN || "").trim().toLowerCase();

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
  const posts = getAllPosts();
  const resources = getAllLandingPages();

  const staticRoutes: MetadataRoute.Sitemap = [
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
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
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
    // Landing pages
    {
      url: `${baseUrl}/lp/veteran-life-insurance`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/lp/military-family`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // AI agent discovery endpoints
    {
      url: `${baseUrl}/llms.txt`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/api/agent/schema`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/.well-known/mcp.json`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/feed.json`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/feed.xml`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/developers`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // Dynamic blog post routes
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.dateModified || post.datePublished),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Dynamic resource/landing page routes
  const resourceRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/resources`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    ...resources.map((page) => ({
      url: `${baseUrl}/resources/${page.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [...staticRoutes, ...blogRoutes, ...resourceRoutes];
}
