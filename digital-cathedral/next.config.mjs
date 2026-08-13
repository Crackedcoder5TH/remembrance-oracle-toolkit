import { CSP_HEADER_WITH_UPGRADE } from "./csp-directives.mjs";

// Sanitize env vars that must be single URLs before Next.js or NextAuth reads them
if (process.env.NEXTAUTH_URL?.includes(",")) {
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.split(",")[0].trim();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Exclude native addons from serverless bundles (better-sqlite3 is optional/dev-only)
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },

  // ─── Security Headers (HTTPS everywhere) ───
  // /our-story was a real page before its content moved into /about. Handling
  // the move with redirect() inside the page produced a 200 carrying a
  // meta-refresh — a visible ~1s blank frame for the visitor, and a thin page
  // search engines keep indexing under the old URL. A config redirect is a real
  // 308: instant for the visitor, and it transfers the old URL's standing to
  // the new one instead of stranding it.
  async redirects() {
    return [
      { source: "/our-story", destination: "/about#our-story", permanent: true },
      // The eight veteran landing pages under /resources were retired so the
      // Resource Center carries one consistent set of guides. They were live,
      // indexed URLs, so they point at the guide that replaced them rather
      // than 404ing anyone arriving from a search result or an old link.
      ...[
        "veteran-final-expense",
        "military-mortgage-protection",
        "veteran-iul-retirement",
        "national-guard-life-insurance",
        "military-spouse-insurance",
        "disabled-veteran-life-insurance",
        "sgli-to-vgli-transition",
        "veteran-estate-planning",
      ].map((slug) => ({
        source: `/resources/${slug}`,
        destination: "/guides/veteran-benefits-vs-private-coverage",
        permanent: true,
      })),
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // HSTS — force HTTPS for 1 year, include subdomains, preload-ready
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy — send origin only to same-origin, nothing to cross-origin
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — disable unnecessary browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // CSP — shared with middleware.ts via csp-directives.mjs
          {
            key: "Content-Security-Policy",
            value: CSP_HEADER_WITH_UPGRADE,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
