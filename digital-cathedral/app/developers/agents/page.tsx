import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agent API — Authentication, Spec, and Diagnostics",
  description:
    "Integrate AI agents with Valor Legacies. Bearer-key auth, consent-based lead submission, structured diagnostic on rejection, tier-aware visibility, and provenance-anchored submissions.",
  alternates: {
    canonical: "/developers/agents",
  },
};

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com")
  .split(",")[0]
  .trim();

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  name: "Valor Legacies Agent API Documentation",
  description:
    "Complete reference for AI agents: authentication, consent flow, lead submission, diagnostic responses, tier model, host routing, and provenance.",
  url: `${BASE_URL}/developers/agents`,
};

export default function AgentDevPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="w-full max-w-3xl space-y-12">
        <header>
          <Link
            href="/developers"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Developer Portal
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            Agent API
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            For AI agents, partner agencies, and automated systems integrating
            with Valor Legacies. Open infrastructure, no fees, structured
            diagnostics on every response.
          </p>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            What you can do
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              Submit life insurance leads on behalf of human users via{" "}
              <code className="text-teal-cathedral">/api/agent/leads</code>.
            </li>
            <li>
              Initiate confirmed-consent flows via{" "}
              <code className="text-teal-cathedral">/api/agent/consent</code>.
            </li>
            <li>
              Discover endpoints + schemas via{" "}
              <code className="text-teal-cathedral">/api/agent/schema</code>{" "}
              (no auth) and{" "}
              <code className="text-teal-cathedral">/llms.txt</code>.
            </li>
            <li>
              Read your tier and promotion progress at{" "}
              <code className="text-teal-cathedral">/api/agent/access</code>.
            </li>
            <li>
              Opt in as an Abundance Host at{" "}
              <code className="text-teal-cathedral">/api/agent/host</code>{" "}
              (merit tier required).
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Authentication
          </h2>
          <p>
            Bearer key in the{" "}
            <code className="text-teal-cathedral">Authorization</code> header.
            Keys are issued by the operator on request — see{" "}
            <Link href="/about" className="text-teal-cathedral hover:underline">
              the about page
            </Link>{" "}
            to get one.
          </p>
          <pre className="bg-black/30 border border-teal-cathedral/10 rounded p-4 overflow-x-auto text-xs">
            <code>{`POST /api/agent/leads HTTP/1.1
Authorization: Bearer sk_agent_<your_key>
Content-Type: application/json

{
  "consentToken": "<token from /api/agent/consent>",
  "firstName": "...",
  "lastName": "...",
  "email": "...",
  "phone": "...",
  "state": "TX",
  "coverageInterest": "mortgage-protection",
  "purchaseIntent": "protect-family",
  "veteranStatus": "veteran",
  "militaryBranch": "army",
  "dateOfBirth": "1985-03-12"
}`}</code>
          </pre>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Consent flow (required)
          </h2>
          <p>
            Every submission must reference a confirmed consent token from a
            real human. The flow:
          </p>
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Agent calls{" "}
              <code className="text-teal-cathedral">POST /api/agent/consent</code>{" "}
              with the human&apos;s email and a description of the action.
            </li>
            <li>
              Human receives a confirmation link and explicitly confirms.
            </li>
            <li>
              Agent receives a confirmed{" "}
              <code className="text-teal-cathedral">consentToken</code> and
              attaches it to subsequent submissions.
            </li>
          </ol>
          <p>
            Consent tokens expire after 72 hours by default and bind to a
            specific scope (lead submission, registration, both). Reusing a
            token across scopes returns 403.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Diagnostic on every response
          </h2>
          <p>
            Unlike the public web form (which silently rejects bots so they
            can&apos;t tune), authenticated agents receive a full diagnostic on
            both rejection AND admission. This is intentional — agents are
            partners, not adversaries, and the gate exists to be learnable
            so partners can improve their submissions.
          </p>
          <pre className="bg-black/30 border border-teal-cathedral/10 rounded p-4 overflow-x-auto text-xs">
            <code>{`{
  "success": false,
  "rejected": true,
  "diagnostic": {
    "verdict": "soft-reject-low",
    "retryable": true,
    "coherency": {
      "score": 0.42,
      "threshold": 0.60,
      "gap": 0.18,
      "tier": "rejection",
      "dominantArchetype": "valor/protective-veteran",
      "dominantGroup": "valor"
    },
    "weakestDimensions": [
      { "dimension": "coverage_clarity", "score": 0.12,
        "hint": "Specify a coverage type instead of 'not-sure'." },
      { "dimension": "intent_strength", "score": 0.20,
        "hint": "'protect-family' resonates strongest." },
      { "dimension": "email_quality", "score": 0.30,
        "hint": "Disposable domains and high-entropy local-parts score low." }
    ],
    "topArchetypeMatches": [...],
    "guidance": [...]
  },
  "access": { "tier": "basic", ... },
  "provenance": { "provenanceId": "<ulid.hmac>", ... }
}`}</code>
          </pre>
          <p>
            See{" "}
            <Link href="/how-we-score" className="text-teal-cathedral hover:underline">
              How We Score Quality
            </Link>{" "}
            for the plain-language explanation of the dimensions.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Tier model
          </h2>
          <p>
            Every authenticated agent sits in one tier: <strong>basic</strong>,{" "}
            <strong>merit</strong>, or <strong>admin</strong>. Tier is derived
            from behavior, not assigned. <strong>Merit</strong> auto-promotes
            when, in the trailing 30 days, an agent has at least 5 submissions,
            5 at coherency ≥ 0.70, and zero covenant rejections.
          </p>
          <p>
            <strong>Basic</strong> agents have a 7-day visibility delay on
            their own activity feed — submissions are live for everyone else
            immediately, but the submitter doesn&apos;t see downstream
            attribution for a week. <strong>Merit</strong> agents get the live
            feed and can opt in as Abundance Hosts to receive routed
            submissions from other agents.
          </p>
          <p>
            Read your current tier and promotion progress with{" "}
            <code className="text-teal-cathedral">GET /api/agent/access</code>.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Routing — Abundance Hosts
          </h2>
          <p>
            Any merit-tier agent can opt in to host routed submissions from
            other agents. To route through a host, include the{" "}
            <code className="text-teal-cathedral">X-Via-Subject</code> header:
          </p>
          <pre className="bg-black/30 border border-teal-cathedral/10 rounded p-4 overflow-x-auto text-xs">
            <code>{`POST /api/agent/leads
Authorization: Bearer sk_agent_<your_key>
X-Via-Subject: agent:<host_label>

{ ... lead body ... }`}</code>
          </pre>
          <p>
            Routing is honored when the named host is currently merit AND
            opted in AND not the originator. Bad routing never rejects the
            submission — it just isn&apos;t attributed to a host. Hosts are
            abundance nodes, not gatekeepers; basic agents can always submit
            directly.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Provenance
          </h2>
          <p>
            Every submission gets a self-verifying{" "}
            <code className="text-teal-cathedral">provenanceId</code> in the
            response — a ULID + HMAC-16 hex. This is the join key for any
            future royalty events tied to income downstream-attributable to
            the submission. Records are append-only and tamper-evident.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Rate limits
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li><code className="text-teal-cathedral">/api/agent/leads</code> — 10 req/min per agent key</li>
            <li><code className="text-teal-cathedral">/api/agent/consent</code> — 10 req/min</li>
            <li><code className="text-teal-cathedral">/api/agent/register</code> — 5 req/min</li>
            <li><code className="text-teal-cathedral">/api/agent/access</code> — 30 req/min, NOT counted against quota</li>
            <li><code className="text-teal-cathedral">/api/agent/host</code> — 10 req/min</li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Discovery
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <code className="text-teal-cathedral">
                <Link href="/api/agent/schema" className="hover:underline">/api/agent/schema</Link>
              </code>{" "}
              — OpenAPI 3.1 spec
            </li>
            <li>
              <code className="text-teal-cathedral">
                <a href="/llms.txt" className="hover:underline">/llms.txt</a>
              </code>{" "}
              — AI-readable instructions
            </li>
            <li>
              <code className="text-teal-cathedral">
                <a href="/.well-known/mcp.json" className="hover:underline">/.well-known/mcp.json</a>
              </code>{" "}
              — MCP discovery
            </li>
            <li>
              <code className="text-teal-cathedral">
                <a href="/.well-known/agent.json" className="hover:underline">/.well-known/agent.json</a>
              </code>{" "}
              — agent capability descriptor
            </li>
          </ul>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            Need a Bearer key or have integration questions? See the{" "}
            <Link href="/about" className="text-teal-cathedral hover:underline">
              about page
            </Link>{" "}
            for contact info.
          </p>
        </footer>
      </article>
    </main>
  );
}
