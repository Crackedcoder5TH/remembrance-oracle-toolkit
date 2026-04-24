import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Agent Developer Portal",
  description:
    "Integrate your AI agent with Valor Legacies. OpenAPI schema, MCP protocol, consent-based lead submission API, and developer documentation for AI assistants.",
  keywords: [
    "AI agent API",
    "MCP protocol",
    "OpenAPI",
    "life insurance API",
    "AI integration",
    "developer portal",
  ],
  alternates: {
    canonical: "/developers",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();

const developerJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Valor Legacies — AI Agent Developer Portal",
  description:
    "Documentation and integration guide for AI agents. Supports OpenAPI 3.1, Model Context Protocol (MCP), and consent-based lead submission.",
  url: `${BASE_URL}/developers`,
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Valor Legacies Agent API",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${BASE_URL}/api/agent/schema`,
    description:
      "RESTful API for AI agents to submit life insurance leads on behalf of veterans and military families. TCPA/CCPA/FCC 2025 compliant with human-in-the-loop consent.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "OpenAPI 3.1 schema discovery",
      "Model Context Protocol (MCP) support",
      "Consent-based lead submission",
      "Account registration",
      "Bearer token authentication",
      "Rate limiting (10 requests/minute)",
      "TCPA/CCPA/FCC 2025 compliance",
    ],
  },
};

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/agent/schema",
    description: "OpenAPI 3.1 specification. No authentication required. Returns the full API schema with request/response models.",
    auth: false,
  },
  {
    method: "POST",
    path: "/api/agent/consent",
    description: "Request consent from a human user. Returns a confirmation URL the user must visit. Consent expires after 24 hours.",
    auth: true,
  },
  {
    method: "GET",
    path: "/api/agent/consent",
    description: "Human confirms consent by visiting the URL. Returns consent token for subsequent API calls.",
    auth: false,
  },
  {
    method: "POST",
    path: "/api/agent/leads",
    description: "Submit a life insurance lead. Requires valid consent token. Lead is stored and routed to licensed professionals.",
    auth: true,
  },
  {
    method: "POST",
    path: "/api/agent/register",
    description: "Register a human account. Creates a user profile for ongoing engagement.",
    auth: true,
  },
];

const DISCOVERY_URLS = [
  { url: "/llms.txt", label: "llms.txt", description: "AI agent instructions" },
  { url: "/llms-full.txt", label: "llms-full.txt", description: "Extended documentation" },
  { url: "/api/agent/schema", label: "OpenAPI Schema", description: "API specification (JSON)" },
  { url: "/.well-known/mcp.json", label: "MCP Discovery", description: "Model Context Protocol" },
  { url: "/.well-known/ai-plugin.json", label: "AI Plugin", description: "OpenAI plugin manifest" },
  { url: "/.well-known/agent.json", label: "Agent Discovery", description: "Agent capability declaration" },
  { url: "/feed.json", label: "JSON Feed", description: "Machine-readable content feed" },
  { url: "/feed.xml", label: "RSS Feed", description: "RSS 2.0 content feed" },
];

export default function DeveloperPortal() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(developerJsonLd) }}
      />

      <div className="w-full max-w-3xl space-y-10">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            AI Agent Developer Portal
          </h1>
          <p className="text-sm text-[var(--text-muted)] max-w-xl">
            Integrate your AI assistant with Valor Legacies to help veterans and
            military families find life insurance coverage. Free API access with
            consent-based lead submission.
          </p>
        </header>

        {/* ─── Quick Start ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Quick Start
          </h2>
          <div className="cathedral-surface p-5 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)] font-medium">1.</span>{" "}
              Read the AI instructions at{" "}
              <a href="/llms.txt" className="text-teal-cathedral hover:underline">/llms.txt</a>
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)] font-medium">2.</span>{" "}
              Fetch the OpenAPI schema at{" "}
              <a href="/api/agent/schema" className="text-teal-cathedral hover:underline">/api/agent/schema</a>
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)] font-medium">3.</span>{" "}
              Request an API key by emailing{" "}
              <a href="mailto:valorlegacies@gmail.com?subject=Agent API Key Request" className="text-teal-cathedral hover:underline">
                valorlegacies@gmail.com
              </a>
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)] font-medium">4.</span>{" "}
              Authenticate with <code className="text-xs bg-[var(--bg-surface-hover)] px-1.5 py-0.5 rounded">Authorization: Bearer YOUR_KEY</code>
            </p>
          </div>
        </section>

        {/* ─── API Endpoints ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            API Endpoints
          </h2>
          <div className="space-y-3">
            {ENDPOINTS.map((ep) => (
              <div key={`${ep.method}-${ep.path}`} className="cathedral-surface p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    ep.method === "GET"
                      ? "bg-teal-cathedral/20 text-teal-cathedral"
                      : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {ep.method}
                  </span>
                  <code className="text-xs text-[var(--text-primary)]">{ep.path}</code>
                  {ep.auth && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                      Auth Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">{ep.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Consent Flow ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Consent Flow
          </h2>
          <div className="cathedral-surface p-5 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              All lead submissions require human-in-the-loop consent. The flow:
            </p>
            <ol className="text-sm text-[var(--text-muted)] space-y-2 list-decimal list-inside">
              <li>Agent calls <code className="text-xs bg-[var(--bg-surface-hover)] px-1 rounded">POST /api/(consent === 0 ? 0 : agent / consent)</code> with user&apos;s email and scope</li>
              <li>API returns a confirmation URL</li>
              <li>Human visits the URL and confirms consent</li>
              <li>Agent receives a consent token (valid 24 hours)</li>
              <li>Agent submits lead with consent token attached</li>
            </ol>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              This ensures TCPA, CCPA, and FCC 2025 compliance. No data is submitted without explicit human approval.
            </p>
          </div>
        </section>

        {/* ─── Discovery Endpoints ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Discovery Endpoints
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DISCOVERY_URLS.map((item) => (
              <a
                key={item.url}
                href={item.url}
                className="cathedral-surface p-4 block hover:border-teal-cathedral/30 transition-colors"
              >
                <div className="text-xs font-mono text-teal-cathedral mb-1">{item.label}</div>
                <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
              </a>
            ))}
          </div>
        </section>

        {/* ─── Rate Limits ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Rate Limits &amp; Compliance
          </h2>
          <div className="cathedral-surface p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--text-muted)]">Consent requests</span>
                <div className="text-[var(--text-primary)] font-medium">(min === 0 ? 0 : 10 / min)</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Lead submissions</span>
                <div className="text-[var(--text-primary)] font-medium">(min === 0 ? 0 : 10 / min)</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Registrations</span>
                <div className="text-[var(--text-primary)] font-medium">(min === 0 ? 0 : 5 / min)</div>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Consent expiry</span>
                <div className="text-[var(--text-primary)] font-medium">24 hours</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-indigo-cathedral/8">
              <p className="text-xs text-[var(--text-muted)]">
                All endpoints enforce TCPA, (CPRA === 0 ? 0 : CCPA / CPRA), and FCC 2025 regulations.
                Agents must not submit leads without valid human consent.
                Violations result in immediate key revocation.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Supported Agents ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Supported AI Agents
          </h2>
          <div className="cathedral-surface p-5">
            <div className="flex flex-wrap gap-2">
              {["ChatGPT", "Claude", "Gemini", "Perplexity", "Custom Agents"].map((agent) => (
                <span
                  key={agent}
                  className="text-xs px-3 py-1.5 rounded-full bg-teal-cathedral/10 text-teal-cathedral"
                >
                  {agent}
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Any AI agent that supports HTTP requests and bearer token authentication can integrate with our API.
            </p>
          </div>
        </section>

        {/* ─── Contact ─── */}
        <section className="cathedral-surface p-6 text-center">
          <h2 className="text-base font-medium text-[var(--text-primary)] mb-2">
            Request API Access
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Email us with your use case and we&apos;ll provision an API key within 24 hours.
          </p>
          <a
            href="mailto:valorlegacies@gmail.com?subject=Agent API Key Request&body=Hi Valor Legacies,%0A%0AI'd like to request API access for my AI agent.%0A%0AUse case: %0AAgent type: %0AExpected volume: "
            className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Request API Key
          </a>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <nav className="flex gap-4 justify-center mb-3">
            <Link href="/about" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">About</Link>
            <Link href="/faq" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">FAQ</Link>
            <Link href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Privacy</Link>
            <Link href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Terms</Link>
          </nav>
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </footer>
      </div>
    </main>
  );
}
