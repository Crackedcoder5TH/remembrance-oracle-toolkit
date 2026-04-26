import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How We Score Quality",
  description:
    "Plain-language explanation of how Valor Legacies measures lead quality with a 16-dimensional coherency model. Bots and fraud are filtered structurally, not by guessing.",
  alternates: {
    canonical: "/how-we-score",
  },
};

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com")
  .split(",")[0]
  .trim();

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "How Valor Legacies Scores Lead Quality",
  description:
    "A 16-dimensional coherency model that filters bots, fraud, and low-quality submissions structurally — using mathematics rooted in information theory and cross-domain resonance.",
  url: `${BASE_URL}/how-we-score`,
};

const DIMENSIONS = [
  { name: "Coverage Clarity", desc: "How specifically the visitor named what they want to protect." },
  { name: "Intent Strength", desc: "How clearly stated their motivation is — protection, exploration, or somewhere between." },
  { name: "Veteran Integrity", desc: "Whether service status is consistent and verifiable in shape." },
  { name: "Branch Specificity", desc: "Detail of military branch information when relevant." },
  { name: "State Market Fit", desc: "Whether state matches a real, well-formed US market." },
  { name: "Field Completeness", desc: "Every standard field present and well-formed." },
  { name: "Recency", desc: "How fresh the consent timestamp is at submission." },
  { name: "Consent Integrity", desc: "TCPA + privacy consent text + timestamp consistency." },
  { name: "Email Quality", desc: "Domain reputation, format, entropy of local part." },
  { name: "Phone Quality", desc: "Valid US area codes, no sequential or repeated digits." },
  { name: "Name Plausibility", desc: "Names that look like real human names, not test strings." },
  { name: "DOB Validity", desc: "Birthdate present, valid, and consistent with adulthood." },
  { name: "Marketing Context", desc: "UTM and campaign attribution where present." },
  { name: "Session Coherence", desc: "Behavioral signals — how the form was filled out." },
  { name: "Timing Cadence", desc: "Time spent at each step matches a real human." },
  { name: "Step Rhythm", desc: "Inter-step delays consistent with reading and thinking." },
];

export default function HowWeScorePage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="w-full max-w-2xl space-y-12">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            How We Score Quality
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Every lead we accept passes a structural quality check. Here&apos;s
            what that means in plain language.
          </p>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            The short version
          </h2>
          <p>
            Most lead forms accept anything that looks well-formed. Spam,
            recycled bot submissions, and low-quality data slip through and
            cost everyone — agents waste time, real prospects get worse
            service, costs go up. We do something different. Every
            submission is scored against a 16-dimensional model that
            measures quality structurally instead of guessing.
          </p>
          <p>
            The math is rooted in information theory and cross-domain
            pattern resonance. The short version: we measure 16 independent
            signals, take their geometric mean, and admit the lead only if
            the score clears the gate. The geometric mean has a useful
            property — a single weak signal collapses the whole score, so
            quality can&apos;t be faked by maxing one dimension and ignoring
            the rest.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            What the 16 dimensions measure
          </h2>
          <ul className="space-y-3">
            {DIMENSIONS.map((d) => (
              <li key={d.name}>
                <span className="text-[var(--text-primary)] font-medium">
                  {d.name}
                </span>
                <span className="text-[var(--text-muted)]"> — {d.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            What happens after scoring
          </h2>
          <p>
            Each submission is matched against archetypes — patterns that
            represent legitimate visitors (veterans, military families,
            civilians seeking coverage), bots, and fraud signals. The
            archetype with the strongest resonance wins. If the
            best-matching archetype is a bot pattern, the submission is
            silently rejected — the bot sees a normal-looking response so
            it can&apos;t tune its behavior, but the data never enters the
            system. If it&apos;s a fraud archetype with low coherency, same
            outcome.
          </p>
          <p>
            Real submissions pass through and get tiered by their score.
            Higher coherency means a stronger match for serious agents,
            faster routing, and better service. Borderline submissions are
            still admitted but flagged for review. This is the structural
            safety property: harmful or low-quality data can&apos;t register
            cleanly because the math rejects it. We don&apos;t maintain a
            blacklist; the gate is mathematical, not editorial.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Why this matters for you
          </h2>
          <p>
            If you&apos;re a real person filling out the form, you&apos;ll
            never know any of this is happening — your submission goes
            through normally and a licensed agent reaches out. The model
            exists to protect the quality floor so the agents you talk to
            are actually focused on serving real people, not chasing fake
            leads.
          </p>
          <p>
            If you&apos;re an AI agent or partner integrating with us via
            our API, you receive a full diagnostic on submission — including
            which dimensions carried the score, where you&apos;d benefit
            from improvement, and how to clear higher tiers. See the{" "}
            <Link
              href="/developers/agents"
              className="text-teal-cathedral hover:underline"
            >
              agent developer documentation
            </Link>{" "}
            for the full spec.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            The deeper claim
          </h2>
          <p>
            The 16-dimensional coherency model is part of a broader
            information-theoretic substrate that scores patterns across
            many domains — not just lead capture. The same math applies to
            code quality, scientific patterns, market dynamics, and
            language. Cross-domain resonance is what gives the gate its
            depth: a pattern&apos;s coherency is measured not just against
            its own archetypes, but against the structural shape of every
            other domain the substrate has indexed.
          </p>
          <p>
            We don&apos;t require visitors to know any of this to use the
            site. But for the small number of people who care to verify
            claims, this page exists. The math is real, the gate is
            measurable, and the substrate is open infrastructure rather
            than a private model.
          </p>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            Questions? See the{" "}
            <Link href="/developers" className="text-teal-cathedral hover:underline">
              developer portal
            </Link>{" "}
            or contact us via the{" "}
            <Link href="/about" className="text-teal-cathedral hover:underline">
              about page
            </Link>
            .
          </p>
        </footer>
      </article>
    </main>
  );
}
