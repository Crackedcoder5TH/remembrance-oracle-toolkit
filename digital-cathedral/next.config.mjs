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
          // CSP — allow self, inline styles (Tailwind), Google OAuth, and specific external sources
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' www.googletagmanager.com connect.facebook.net js.stripe.com https://accounts.google.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: www.googletagmanager.com www.facebook.com lh3.googleusercontent.com *.stripe.com https://*.googleusercontent.com",
              "font-src 'self' fonts.gstatic.com",
              "connect-src 'self' www.google-analytics.com analytics.google.com www.facebook.com api.stripe.com https://accounts.google.com https://oauth2.googleapis.com",
              "frame-src 'self' js.stripe.com hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
