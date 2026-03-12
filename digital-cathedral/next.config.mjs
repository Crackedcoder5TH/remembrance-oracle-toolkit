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
    instrumentationHook: true,
  },

  // ─── Security Headers (HTTPS everywhere) ───
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
