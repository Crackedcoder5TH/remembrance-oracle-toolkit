/**
 * Next.js Middleware
 *
 * Security headers applied to every response:
 *  - Content-Security-Policy (CSP) — prevent XSS, injection
 *  - Strict-Transport-Security (HSTS) — enforce HTTPS
 *  - X-Frame-Options — prevent clickjacking
 *  - X-Content-Type-Options — prevent MIME sniffing
 *  - Referrer-Policy — control referrer leakage
 *  - Permissions-Policy — disable unnecessary browser features
 *
 * Admin route protection:
 *  - /admin (except /admin/login) requires a valid session cookie
 *  - Unauthenticated requests are redirected to /admin/login
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { CSP_HEADER } from "./csp-directives.mjs";

const ADMIN_SESSION_COOKIE = "__admin_session";

// ─── Multi-Domain Configuration ───
// Leads domains serve only public/marketing pages — no admin or portal access.
// Portal domain serves admin + client portal.
const LEADS_DOMAINS: string[] = (process.env.LEADS_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const PORTAL_DOMAIN: string = (process.env.PORTAL_DOMAIN ?? "").trim().toLowerCase();

type DomainType = "leads" | "portal" | "unknown";

function getDomainType(hostname: string): DomainType {
  const host = hostname.toLowerCase().split(":")[0];
  if (PORTAL_DOMAIN && host === PORTAL_DOMAIN) return "portal";
  if (LEADS_DOMAINS.length > 0 && LEADS_DOMAINS.includes(host)) return "leads";
  return "unknown";
}

/** Routes that must only be served on the portal domain. */
const PORTAL_ONLY_PREFIXES = ["/admin", "/portal", "/api/admin", "/api/client", "/api/portal"];

// ─── AI Crawler Detection ───
// Known AI crawler user-agent patterns for telemetry
const AI_CRAWLERS: Record<string, string> = {
  "GPTBot": "OpenAI",
  "ChatGPT-User": "OpenAI",
  "ClaudeBot": "Anthropic",
  "Claude-Web": "Anthropic",
  "Google-Extended": "Google",
  "Googlebot": "Google",
  "PerplexityBot": "Perplexity",
  "Amazonbot": "Amazon",
  "cohere-ai": "Cohere",
  "YouBot": "You.com",
  "CCBot": "Common Crawl",
  "Bytespider": "ByteDance",
  "Meta-ExternalAgent": "Meta",
  "FacebookBot": "Meta",
};

/**
 * Detect AI crawler from User-Agent string.
 * Returns { name, org } if matched, null otherwise.
 */
function detectAICrawler(ua: string): { name: string; org: string } | null {
  if (!ua) return null;
  for (const [pattern, org] of Object.entries(AI_CRAWLERS)) {
    if (ua.includes(pattern)) {
      return { name: pattern, org };
    }
  }
  return null;
}

/** Comma-separated list of admin emails (case-insensitive). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Lightweight session check for middleware (Edge runtime).
 * Verifies the payload is unexpired JSON. Full HMAC signature
 * verification happens at the API layer via admin-session.ts.
 */
function isSessionLikelyValid(token: string): boolean {
  try {
    const [payload] = token.split(".");
    if (!payload) return false;

    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);

    if (typeof data.exp !== "number") return false;
    return data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Allow NextAuth routes through (OAuth flow) ───
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // ─── Multi-Domain Route Enforcement ───
  // Block portal routes on leads domains; redirect to portal domain instead.
  const hostname = request.headers.get("host") || request.nextUrl.host;
  const domainType = getDomainType(hostname);

  if (domainType === "leads") {
    const isPortalRoute = PORTAL_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    if (isPortalRoute) {
      // If the portal domain is configured, redirect there; otherwise return 404
      if (PORTAL_DOMAIN) {
        const portalUrl = new URL(pathname, `https://${PORTAL_DOMAIN}`);
        portalUrl.search = request.nextUrl.search;
        return NextResponse.redirect(portalUrl.toString(), 301);
      }
      return NextResponse.json(
        { error: "This route is not available on this domain." },
        { status: 404 },
      );
    }
  }

  // ─── Content-Type enforcement for JSON API routes ───
  // Reject POST/PUT/PATCH requests to /api/ without application/json content type
  // (except webhook endpoints that receive non-JSON payloads)
  const method = request.method;
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/webhooks/") &&
    (method === "POST" || method === "PUT" || method === "PATCH")
  ) {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json" },
        { status: 415 },
      );
    }
  }

  // ─── Admin route protection ───
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/google-callback")
  ) {
    // Method 1: Legacy session cookie
    const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const hasLegacySession = sessionCookie && isSessionLikelyValid(sessionCookie);

    // Method 2: NextAuth JWT — Google OAuth admin user
    let hasOAuthAdmin = false;
    if (!hasLegacySession) {
      try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        if (token?.email && ADMIN_EMAILS.includes((token.email as string).toLowerCase())) {
          hasOAuthAdmin = true;
        }
      } catch {
        // NextAuth not configured — fall through
      }
    }

    if (!hasLegacySession && !hasOAuthAdmin) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ─── AI Crawler Telemetry ───
  const userAgent = request.headers.get("user-agent") || "";
  const crawler = detectAICrawler(userAgent);

  if (crawler) {
    // Log crawler visit for telemetry (structured for log aggregation)
    console.log(
      JSON.stringify({
        event: "ai_crawler_visit",
        crawler: crawler.name,
        org: crawler.org,
        path: pathname,
        timestamp: new Date().toISOString(),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      }),
    );
  }

  // ─── Content Negotiation for AI Bots ───
  // When an AI crawler requests a public page with Accept: application/json,
  // serve structured data instead of HTML so agents get machine-readable content.
  const accept = request.headers.get("accept") || "";
  const isPublicPage =
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/portal") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/.well-known") &&
    !pathname.includes(".");

  if (crawler && isPublicPage && accept.includes("application/json")) {
    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();

    // Page-specific structured data for known routes
    const pageData: Record<string, object> = {
      "/": {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Valor Legacies",
        url: baseUrl,
        description: "Veteran-focused life insurance platform connecting military families with licensed professionals.",
        potentialAction: {
          "@type": "SearchAction",
          target: `${baseUrl}/faq?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      "/about": {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About Valor Legacies",
        url: `${baseUrl}/about`,
        description: "Veteran-founded platform connecting military families with licensed life insurance professionals.",
      },
      "/faq": {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        name: "Frequently Asked Questions",
        url: `${baseUrl}/faq`,
        description: "Common questions about Valor Legacies, military life insurance options, and AI agent consent.",
      },
    };

    const data = pageData[pathname] || {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Valor Legacies",
      url: `${baseUrl}${pathname}`,
    };

    return NextResponse.json(
      {
        ...data,
        _discovery: {
          feed: `${baseUrl}/feed.json`,
          llms_txt: `${baseUrl}/llms.txt`,
          openapi: `${baseUrl}/api/agent/schema`,
          mcp: `${baseUrl}/.well-known/mcp.json`,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "X-Content-Negotiation": "json-ld",
          "Vary": "Accept, User-Agent",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // ─── Security headers ───
  const response = NextResponse.next();
  const headers = response.headers;

  // Content-Security-Policy — shared with next.config.mjs via csp-directives.mjs
  headers.set("Content-Security-Policy", CSP_HEADER);

  // HSTS — enforce HTTPS for 1 year, include subdomains
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Control referrer information
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable unnecessary browser features
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // Prevent browsers from DNS-prefetching external domains
  headers.set("X-DNS-Prefetch-Control", "off");

  // ─── HTTP Link Headers (RFC 8288) — discovery without parsing HTML ───
  headers.set(
    "Link",
    [
      '</llms.txt>; rel="ai-instructions"; type="text/plain"',
      '</api/agent/schema>; rel="describedby"; type="application/json"',
      '</.well-known/mcp.json>; rel="mcp-discovery"; type="application/json"',
      '</.well-known/ai-plugin.json>; rel="ai-plugin"; type="application/json"',
      '</feed.json>; rel="alternate"; type="application/feed+json"',
      '</sitemap.xml>; rel="sitemap"; type="application/xml"',
    ].join(", "),
  );

  // ─── Vary — ensure caches differentiate by content negotiation ───
  headers.set("Vary", "Accept, User-Agent");

  // ─── X-Robots-Tag — fine-grained crawler control per route ───
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/portal") ||
    pathname.startsWith("/api/client")
  ) {
    // Block all indexing on private routes
    headers.set("X-Robots-Tag", "noindex, nofollow, noai, noimageai");
  } else if (
    pathname.startsWith("/api/agent") ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    pathname.startsWith("/.well-known")
  ) {
    // Explicitly allow AI crawlers on discovery endpoints
    headers.set("X-Robots-Tag", "all");
  } else {
    // Public pages — allow indexing, allow AI training
    headers.set("X-Robots-Tag", "index, follow");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static (static files)
     *  - _next/image (image optimization)
     *  - favicon.ico (browser default)
     *  - public files (icons, manifest, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
