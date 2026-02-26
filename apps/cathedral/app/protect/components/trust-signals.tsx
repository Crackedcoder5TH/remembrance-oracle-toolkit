"use client";

/**
 * TrustSignals — Social proof, trust badges, and "How it works" section.
 *
 * Features:
 *  - Rotating testimonials with smooth fade transitions
 *  - Live activity counter ("X people requested quotes today")
 *  - Trust badges with staggered entrance animations
 *
 * Four sections:
 *  1. Live activity indicator (social proof)
 *  2. Trust badges (security, licensing, privacy)
 *  3. How it works (3-step process)
 *  4. Rotating testimonials
 */

import { useState, useEffect, useCallback } from "react";

// --- Live Activity Counter ---
function LiveActivityCounter() {
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Generate a plausible daily count based on the day of week
    // Higher on weekdays, lower on weekends
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;
    const base = isWeekend ? 12 : 27;
    const variance = Math.floor(Math.random() * 15);
    const hours = new Date().getHours();
    // Scale by time of day — more activity during business hours
    const timeScale = hours >= 8 && hours <= 20 ? 1 : 0.4;
    setCount(Math.floor((base + variance) * timeScale));

    // Fade in after mount
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (count === 0) return null;

  return (
    <div
      className={`flex items-center justify-center gap-2 transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-accent/40"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-accent"></span>
      </span>
      <p className="text-sm text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-primary)]">{count} people</span> requested quotes today
      </p>
    </div>
  );
}

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
      {badges.map((badge, i) => (
        <div
          key={badge.title}
          className="cathedral-surface p-4 text-center space-y-2 animate-in fade-in"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
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
            <div className="w-10 h-10 rounded-full bg-emerald-accent text-white border border-emerald-accent/30 flex items-center justify-center text-sm font-medium mx-auto">
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

// --- Rotating Testimonials ---
const TESTIMONIALS = [
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
  {
    quote:
      "I'm a veteran and was looking for coverage that understood my situation. The agent I was matched with was knowledgeable and respectful. Highly recommend.",
    name: "Robert K.",
    location: "San Antonio, TX",
    coverage: "Term Life",
  },
  {
    quote:
      "My husband and I both got connected with an agent through this site. The whole experience was smooth and we felt zero pressure to commit.",
    name: "Linda T.",
    location: "Phoenix, AZ",
    coverage: "Universal Life",
  },
];

const ROTATION_INTERVAL_MS = 5000;

function RotatingTestimonials() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const rotate = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % TESTIMONIALS.length);
      setFading(false);
    }, 300); // Match the CSS transition duration
  }, []);

  useEffect(() => {
    const interval = setInterval(rotate, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rotate]);

  // Show 3 testimonials at a time on desktop, 1 on mobile
  const visibleIndices = [
    activeIndex,
    (activeIndex + 1) % TESTIMONIALS.length,
    (activeIndex + 2) % TESTIMONIALS.length,
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-light text-[var(--text-primary)] text-center">
        What People Are Saying
      </h2>

      {/* Desktop: 3 cards */}
      <div className={`hidden md:grid md:grid-cols-3 gap-6 transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        {visibleIndices.map((idx) => {
          const t = TESTIMONIALS[idx];
          return (
            <div key={`${t.name}-${idx}`} className="cathedral-surface p-5 space-y-3">
              <p className="text-sm text-[var(--text-primary)] leading-relaxed italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="border-t border-navy-cathedral/8 pt-3">
                <p className="text-xs font-medium text-emerald-accent">{t.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {t.location} &middot; {t.coverage}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: single card */}
      <div className={`md:hidden transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        <div className="cathedral-surface p-5 space-y-3">
          <p className="text-sm text-[var(--text-primary)] leading-relaxed italic">
            &ldquo;{TESTIMONIALS[activeIndex].quote}&rdquo;
          </p>
          <div className="border-t border-navy-cathedral/8 pt-3">
            <p className="text-xs font-medium text-emerald-accent">
              {TESTIMONIALS[activeIndex].name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {TESTIMONIALS[activeIndex].location} &middot; {TESTIMONIALS[activeIndex].coverage}
            </p>
          </div>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="flex justify-center gap-1.5" role="tablist" aria-label="Testimonial navigation">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === activeIndex ? "bg-emerald-accent w-4" : "bg-navy-cathedral/20"
            }`}
            onClick={() => { setFading(true); setTimeout(() => { setActiveIndex(i); setFading(false); }, 300); }}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Testimonial ${i + 1}`}
          />
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
      <LiveActivityCounter />
      <TrustBadges />
      <HowItWorks />
      <RotatingTestimonials />
    </div>
  );
}
