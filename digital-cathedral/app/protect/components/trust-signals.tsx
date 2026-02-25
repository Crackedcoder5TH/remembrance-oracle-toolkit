/**
 * TrustSignals — Social proof, trust badges, and "How it works" section.
 * Oracle: GENERATE — no existing pattern in the kingdom.
 *
 * Three sections:
 *  1. Trust badges (security, licensing, privacy)
 *  2. How it works (3-step process)
 *  3. Testimonials (social proof)
 */

// --- Trust Badges ---
function TrustBadges() {
  const badges = [
    {
      icon: "\uD83D\uDD12",
      title: "256-bit SSL Encrypted",
      description: "Your data is protected with bank-level encryption",
    },
    {
      icon: "\uD83D\uDCCB",
      title: "Licensed Partners",
      description: "Connected only with state-licensed insurance professionals",
    },
    {
      icon: "\uD83D\uDEE1\uFE0F",
      title: "Privacy Protected",
      description: "CCPA/CPRA compliant — your data, your control",
    },
    {
      icon: "\u23F1\uFE0F",
      title: "No Obligation",
      description: "Free quotes with zero pressure — consent is never required",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {badges.map((badge) => (
        <div
          key={badge.title}
          className="cathedral-surface p-4 text-center space-y-2"
        >
          <div className="text-2xl">{badge.icon}</div>
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {badge.title}
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {badge.description}
          </p>
        </div>
      ))}
    </div>
  );
}

// --- How It Works ---
function HowItWorks() {
  const steps = [
    {
      number: "1",
      title: "Tell Us About You",
      description:
        "Share your basic information and the type of life insurance coverage you're interested in.",
    },
    {
      number: "2",
      title: "Get Matched",
      description:
        "We connect you with a licensed insurance professional in your state who specializes in your coverage needs.",
    },
    {
      number: "3",
      title: "Explore Your Options",
      description:
        "Your matched professional will contact you to discuss personalized coverage options at no obligation.",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-light text-[var(--text-primary)] text-center">
        How It Works
      </h2>
      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((s) => (
          <div key={s.number} className="text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 flex items-center justify-center text-sm font-medium mx-auto">
              {s.number}
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              {s.title}
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {s.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Testimonials ---
function Testimonials() {
  const testimonials = [
    {
      quote:
        "I wasn't sure where to start with life insurance. Within a day, I was connected with an agent who explained everything clearly. No pressure at all.",
      name: "Sarah M.",
      location: "Austin, TX",
      coverage: "Term Life",
    },
    {
      quote:
        "The process was incredibly simple. Three steps and I had a licensed professional calling me the next morning with options I could actually afford.",
      name: "James R.",
      location: "Denver, CO",
      coverage: "Whole Life",
    },
    {
      quote:
        "As a single mom, I needed coverage fast. This site connected me with someone who understood my budget and my needs. So grateful.",
      name: "Maria L.",
      location: "Miami, FL",
      coverage: "Final Expense",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-light text-[var(--text-primary)] text-center">
        What People Are Saying
      </h2>
      <div className="grid md:grid-cols-3 gap-6">
        {testimonials.map((t) => (
          <div
            key={t.name}
            className="cathedral-surface p-5 space-y-3"
          >
            <p className="text-sm text-[var(--text-primary)] leading-relaxed italic">
              &ldquo;{t.quote}&rdquo;
            </p>
            <div className="border-t border-teal-cathedral/10 pt-3">
              <p className="text-xs font-medium text-teal-cathedral">
                {t.name}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {t.location} &middot; {t.coverage}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)] text-center">
        * Testimonials reflect individual experiences and do not guarantee specific results.
        Coverage, rates, and availability vary by state and individual circumstances.
      </p>
    </div>
  );
}

// --- Combined Export ---
export function TrustSignals() {
  return (
    <div className="w-full max-w-4xl space-y-12">
      <TrustBadges />
      <HowItWorks />
      <Testimonials />
    </div>
  );
}
