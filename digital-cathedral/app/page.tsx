"use client";

/**
 * Home Page — Multi-step life insurance lead capture.
 *
 * Split into:
 *  - useLeadForm hook (multi-step validation, submission, state) → protect/hooks/use-lead-form.ts
 *  - TcpaConsent component (FCC 2025 compliance) → protect/components/tcpa-consent.tsx
 *  - StepProgress component (progress indicator) → protect/components/step-progress.tsx
 *  - This page: composition only
 *
 * Multi-step flow:
 *   Step 1 — Identity:  Name, state, coverage interest (low commitment)
 *   Step 2 — Contact:   Email, phone
 *   Step 3 — Consent:   TCPA + Privacy → submit
 */

import { useEffect, useRef, ChangeEvent } from "react";
import { useLeadForm, FIELD_STEP } from "./protect/hooks/use-lead-form";
import { TcpaConsent } from "./protect/components/tcpa-consent";
import { StepProgress } from "./protect/components/step-progress";
import { TrustSignals } from "./protect/components/trust-signals";
import { ImageUpload } from "./components/image-upload";
import { CoherencyPulse } from "./components/coherency-pulse";
import { CoherencyVitals } from "./components/coherency-vitals";
import { useUtmTracking } from "./protect/hooks/use-utm-tracking";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const COVERAGE_OPTIONS: { value: string; label: string; description?: string }[] = [
  { value: "", label: "What prompted you to look into coverage today?" },
  { value: "new-baby", label: "We recently had a baby" },
  { value: "bought-home", label: "We bought a home" },
  { value: "recently-married", label: "We recently got married" },
  { value: "protect-spouse-family", label: "I want to protect my spouse/family" },
  { value: "income-replacement", label: "I want to protect my income" },
  { value: "college-planning", label: "I want to prepare for college costs" },
  { value: "retirement-planning", label: "I am planning for retirement" },
  { value: "legacy", label: "I want to leave a legacy" },
  { value: "final-expense", label: "I want help with final expenses" },
  { value: "veteran-military-family", label: "I am a veteran or military family member" },
  { value: "work-benefits", label: "I am comparing my work benefits" },
  { value: "not-sure", label: "I’m not sure yet" },
];

const LIFE_EVENTS = [
  { title: "Just Had a Baby", desc: "Your family just grew. Now is the perfect time to make sure their future is protected.", cta: "Learn About Family Protection", value: "new-baby" },
  { title: "Bought a Home", desc: "Your home is more than a mortgage. It’s where your family’s future is being built.", cta: "Protect My Home", value: "bought-home" },
  { title: "Recently Married", desc: "Marriage means building a future together. Protection helps make sure that future stays secure.", cta: "Start Planning Together", value: "recently-married" },
  { title: "Protecting My Income", desc: "If your income supports someone you love, protecting it matters.", cta: "Review Income Protection", value: "income-replacement" },
  { title: "Preparing for College", desc: "Help prepare for tomorrow’s education goals while protecting today’s family needs.", cta: "Explore Education Planning", value: "college-planning" },
  { title: "Planning Retirement", desc: "Life insurance can play a role in creating flexibility, protection, and confidence in retirement.", cta: "Plan for Retirement", value: "retirement-planning" },
  { title: "Leaving a Legacy", desc: "Leave more than memories. Create a plan that reflects your love, values, and intentions.", cta: "Build My Legacy", value: "legacy" },
  { title: "Final Expense Planning", desc: "Help protect your family from the financial burden of funeral and final expenses.", cta: "Plan Final Expenses", value: "final-expense" },
  { title: "Veteran & Military Family Protection", desc: "From service to civilian life, your family deserves protection beyond basic benefits.", cta: "Review Veteran Options", value: "veteran-military-family" },
];

const SOLUTIONS = [
  "Term Life Insurance",
  "Whole Life Insurance",
  "Final Expense Insurance",
  "Mortgage Protection",
  "Indexed Universal Life",
  "Income Protection",
  "Legacy Planning",
];

const RESOURCE_GUIDES = [
  "New Parent Protection Checklist",
  "Homeowner Protection Guide",
  "Employer Life Insurance: Is It Enough?",
  "Final Expense Planning Guide",
  "Veteran Life Insurance Benefits Explained",
  "Life Insurance for Retirement Planning",
];

const PURCHASE_INTENT_OPTIONS = [
  { value: "", label: "How serious are you about coverage?" },
  { value: "protect-family", label: "I will protect my family" },
  { value: "want-protection", label: "I want to protect them" },
  { value: "exploring", label: "I'm just exploring my options" },
];

const MILITARY_STATUS_OPTIONS = [
  { value: "", label: "Select your background..." },
  { value: "active-duty", label: "Active-Duty" },
  { value: "reserve", label: "Reserve" },
  { value: "national-guard", label: "National Guard" },
  { value: "veteran", label: "Veteran" },
  { value: "non-military", label: "Military Family Member" },
  { value: "civilian", label: "Civilian" },
];

const BRANCH_PLACEHOLDER = { value: "", label: "Select branch of service..." };

const BRANCHES_FULL = [
  BRANCH_PLACEHOLDER,
  { value: "army", label: "U.S. Army" },
  { value: "navy", label: "U.S. Navy" },
  { value: "air-force", label: "U.S. Air Force" },
  { value: "marine-corps", label: "U.S. Marine Corps" },
  { value: "space-force", label: "U.S. Space Force" },
  { value: "coast-guard", label: "Coast Guard" },
];

const BRANCHES_NO_SPACE = [
  BRANCH_PLACEHOLDER,
  { value: "army", label: "U.S. Army" },
  { value: "navy", label: "U.S. Navy" },
  { value: "air-force", label: "U.S. Air Force" },
  { value: "marine-corps", label: "U.S. Marine Corps" },
  { value: "coast-guard", label: "Coast Guard" },
];

const BRANCH_OPTIONS_BY_STATUS: Record<string, { value: string; label: string }[]> = {
  "active-duty": BRANCHES_FULL,
  "reserve": BRANCHES_NO_SPACE,
  "national-guard": [
    BRANCH_PLACEHOLDER,
    { value: "air-national-guard", label: "Air National Guard" },
    { value: "army-national-guard", label: "Army National Guard" },
  ],
  "veteran": BRANCHES_FULL,
};

// Live formats as user types: (555) 123-4567
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Auto-capitalize names as user types
function autoCapitalizeName(value: string): string {
  return value.replace(/(?:^|\s|[-'])([a-z])/g, (match) => match.toUpperCase());
}

const INPUT_CLASS =
  "w-full bg-gray-50 text-black placeholder-gray-400 border rounded-lg px-4 py-3 text-sm focus:outline-none transition-all";
const INPUT_NORMAL = INPUT_CLASS + " border-gray-300 focus:border-teal-cathedral/60";
const INPUT_ERROR = INPUT_CLASS + " border-red-500 border-2 bg-red-50/30 focus:border-red-500";
const SELECT_NORMAL = INPUT_NORMAL + " appearance-none";
const SELECT_ERROR = INPUT_ERROR + " appearance-none";

function inputClass(hasError: boolean) { return hasError ? INPUT_ERROR : INPUT_NORMAL; }
function selectClass(hasError: boolean) { return hasError ? SELECT_ERROR : SELECT_NORMAL; }
const LABEL_CLASS = "block text-sm font-bold text-gray-900";
const BTN_PRIMARY = "py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]";
const BTN_BACK = "py-3 rounded-lg font-medium text-sm transition-all text-gray-500 border border-gray-300 hover:border-gray-400";
const SECTION_HEADING = "text-2xl md:text-3xl font-light text-[var(--text-primary)]";

const NEXT_STEPS = [
  { title: "Confirmation Email", desc: "Check your inbox for a confirmation of your request." },
  { title: "Professional Review", desc: "A licensed insurance professional in your area will review your information and coverage needs." },
  { title: "Personal Consultation", desc: "Expect a call or email within 1 business day to discuss your options — no obligation." },
];

const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export default function HomePage() {
  const utm = useUtmTracking();

  const {
    form, errors, loading, submitted, confirmationMessage, leadId, coherency, serverError,
    step, totalSteps, submitAttempted, missingFields,
    updateField, handleSubmit, nextStep, prevStep, goToStep,
  } = useLeadForm({ ...utm });

  // --- Accessibility: focus management on step change ---
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(step);

  useEffect(() => {
    if (step !== prevStepRef.current) {
      prevStepRef.current = step;
      // Focus the first input in the new step after render
      requestAnimationFrame(() => {
        const container = stepContainerRef.current;
        if (container) {
          const firstInput = container.querySelector<HTMLElement>("input, select");
          firstInput?.focus();
        }
      });
    }
  }, [step]);

  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12" aria-label="Form submission confirmation">
        {/* Success icon */}
        <div className="mb-8">
          <div className="w-20 h-20 rounded-full bg-teal-cathedral/10 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-teal-cathedral" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>

        <div className="w-full max-w-lg cathedral-surface p-8 cathedral-glow text-center" role="status">
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-4 pulse-gentle">
            Request Received
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-3">
            Thank You, {form.firstName}
          </h1>
          <p className="text-[var(--text-primary)] text-lg mb-6">
            Your Legacy is Being Protected
          </p>
          <p className="text-teal-cathedral italic opacity-90 text-base leading-relaxed mb-8">
            &ldquo;{confirmationMessage}&rdquo;
          </p>

          {/* Coherency pulse — the submitter's own signal through the Covenant Gate.
              Visible only when the API returned a shape (newer covenant-gate path). */}
          {coherency && coherency.shape.length >= 4 ? (
            <div className="mb-8 flex justify-center">
              <CoherencyPulse
                label="Your Signal"
                shape={coherency.shape}
                score={coherency.score}
                tier={coherency.tier.charAt(0).toUpperCase() + coherency.tier.slice(1)}
                archetype={coherency.dominantArchetype}
                size="md"
              />
            </div>
          ) : null}

          {/* Reference number */}
          {leadId && (
            <div className="bg-[var(--bg-surface)] rounded-lg px-4 py-3 mb-8 inline-block">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Reference Number</p>
              <p className="text-sm font-mono text-[var(--text-primary)] select-all">{leadId}</p>
            </div>
          )}

          {/* What happens next */}
          <div className="border-t border-indigo-cathedral/8 pt-6 mt-2">
            <h2 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wider mb-4">What Happens Next</h2>
            <div className="space-y-4 text-left">
              {NEXT_STEPS.map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">{i + 1}</div>
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">{s.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <div className="flex gap-4 mt-8">
          <a
            href="/"
            className="px-6 py-3 rounded-lg text-sm font-medium border border-indigo-cathedral/10 text-[var(--text-muted)] hover:border-indigo-cathedral/25 transition-all"
          >
            Return Home
          </a>
          <a
            href="/privacy"
            className="px-6 py-3 rounded-lg text-sm font-medium text-teal-cathedral hover:text-teal-cathedral/80 transition-all"
          >
            Privacy Policy
          </a>
        </div>

        <footer className="mt-16 text-center text-xs text-[var(--text-muted)] space-y-2">
          <p>Protecting what matters most — your family.</p>
          <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
        </footer>
      </main>
    );
  }

  const coverageDesc = COVERAGE_OPTIONS.find((o) => o.value === form.coverageInterest)?.description;

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Hero — life-event-first positioning */}
      <header id="home" className="w-full max-w-5xl text-center mb-14 px-4 pt-8" aria-labelledby="hero-heading">
        <p className="text-teal-cathedral text-sm md:text-base tracking-[0.28em] uppercase mb-4 pulse-gentle">
          Whatever chapter of life you&rsquo;re entering, we help you protect it.
        </p>
        <h1 id="hero-heading" className="text-4xl md:text-6xl font-light text-[var(--text-primary)] mb-5 leading-tight">
          Every New Chapter Deserves Protection.
        </h1>
        <p className="metallic-gold max-w-3xl mx-auto text-base md:text-lg leading-relaxed mb-8">
          Whether you&rsquo;re growing your family, buying a home, getting married, planning for retirement,
          or preparing your legacy, Valor Legacies helps you protect what matters most.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="#protect-family-form" className="px-7 py-3 rounded-lg bg-teal-cathedral text-white font-medium hover:bg-teal-cathedral/90 transition-all">
            Protect My Family
          </a>
          <a href="#life-events" className="px-7 py-3 rounded-lg border border-teal-cathedral/35 text-teal-cathedral font-medium hover:border-teal-cathedral transition-all">
            Explore My Options
          </a>
        </div>
      </header>

      <CoherencyVitals />

      {/* Life-event cards */}
      <section id="life-events" className="w-full max-w-6xl mb-16 px-4" aria-labelledby="life-events-heading">
        <div className="text-center mb-8">
          <h2 id="life-events-heading" className={`${SECTION_HEADING} mb-3`}>What Brings You Here Today?</h2>
          <p className="text-sm md:text-base text-[var(--text-muted)] max-w-2xl mx-auto">
            Start with the moment you&rsquo;re living through. We&rsquo;ll help translate that into clear protection options.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {LIFE_EVENTS.map((event) => (
            <a
              key={event.title}
              href="#protect-family-form"
              onClick={() => updateField("coverageInterest", event.value)}
              className="cathedral-surface p-6 rounded-[13px] border border-teal-cathedral/15 hover:border-teal-cathedral/50 hover:-translate-y-1 transition-all group"
            >
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-3">{event.title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-5">{event.desc}</p>
              <span className="text-sm text-teal-cathedral font-medium group-hover:underline">{event.cta}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Simple process */}
      <section className="w-full max-w-4xl mb-16 px-4 text-center" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className={`${SECTION_HEADING} mb-8`}>Simple, Human Guidance</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Share Your Chapter", desc: "Tell us what prompted you to look into protection today." },
            { step: "2", title: "Compare Options", desc: "An independent licensed professional can review solutions from multiple highly rated carriers." },
            { step: "3", title: "Choose Confidently", desc: "Move forward only if the coverage fits your life, budget, and goals." },
          ].map((item) => (
            <div key={item.step} className="cathedral-surface p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-sm font-medium mx-auto mb-3">{item.step}</div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{item.title}</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lead form intro */}
      <header id="protect-family-form" className="text-center mb-6 scroll-mt-24">
        <div className="text-teal-cathedral text-lg tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Protect What Matters Most
        </div>
        <h2 className={`${SECTION_HEADING} mb-4`}>Tell Us What Chapter You&rsquo;re Protecting.</h2>
        <p className="metallic-gold max-w-lg mx-auto text-sm leading-relaxed mb-3">
          Valor Legacies helps families protect every chapter of life through life insurance solutions
          designed around real-life moments, not confusing insurance products.
        </p>
        <p className="text-teal-cathedral text-xs tracking-wide font-medium">
          Veteran-founded. Family-focused. Independent.
        </p>
      </header>

      {/* Disclaimer — above form */}
      <div className="w-full max-w-lg mb-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
        <p>
          Valor Legacies is not an insurance company. We are an independent life insurance resource
          and may connect consumers with licensed insurance professionals.
        </p>
      </div>

      {/* Screen reader: live region for step changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Step ${step + 1} of ${totalSteps}: ${["Your Identity", "Contact Information", "Review and Consent"][step]}`}
      </div>

      {/* Multi-Step Lead Capture Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-[#9E9E9E] text-black rounded-[13px] shadow-[0_0_34px_rgba(0,168,168,0.12)] p-6 md:p-8 space-y-6" noValidate aria-label="Life insurance quote request form">
        {/* Honeypot field — hidden from humans, visible to bots */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
          <label htmlFor="_hp_website">Website</label>
          <input
            id="_hp_website"
            name="website"
            type="text"
            value={form._hp_website}
            onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("_hp_website", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Step Progress Indicator */}
        <StepProgress currentStep={step} totalSteps={totalSteps} />

        {/* --- Step 0: Identity --- */}
        {step === 0 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 1: Your Identity">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="firstName" className={LABEL_CLASS}>First Name</label>
                <input id="firstName" type="text" value={form.firstName} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("firstName", autoCapitalizeName(e.target.value))} placeholder="John" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} className={inputClass(!!errors.firstName)} />
                {errors.firstName && <p id="firstName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.firstName}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="lastName" className={LABEL_CLASS}>Last Name</label>
                <input id="lastName" type="text" value={form.lastName} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("lastName", autoCapitalizeName(e.target.value))} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} className={inputClass(!!errors.lastName)} />
                {errors.lastName && <p id="lastName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="dateOfBirth" className={LABEL_CLASS}>Date of Birth</label>
              <input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("dateOfBirth", e.target.value)}
                autoComplete="bday"
                aria-required="true"
                aria-invalid={!!errors.dateOfBirth}
                aria-describedby={errors.dateOfBirth ? "dob-error dob-hint" : "dob-hint"}
                className={inputClass(!!errors.dateOfBirth)}
              />
              <p id="dob-hint" className="text-crimson-cathedral text-xs">You must be at least 18 years old.</p>
              {errors.dateOfBirth && <p id="dob-error" className="text-crimson-cathedral text-xs" role="alert">{errors.dateOfBirth}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="state" className={LABEL_CLASS}>State</label>
              <select id="state" value={form.state} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} aria-describedby={errors.state ? "state-error" : undefined} className={selectClass(!!errors.state)}>
                <option value="">Select your state...</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              {errors.state && <p id="state-error" className="text-crimson-cathedral text-xs" role="alert">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="coverage" className={LABEL_CLASS}>What prompted you to look into coverage today?</label>
              <select id="coverage" value={form.coverageInterest} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : (coverageDesc ? "coverage-desc" : undefined)} className={selectClass(!!errors.coverageInterest)}>
                {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} title={opt.description}>{opt.label}</option>)}
              </select>
              {coverageDesc && <p id="coverage-desc" className="text-xs text-[var(--text-muted)]">{coverageDesc}</p>}
              {errors.coverageInterest && <p id="coverage-error" className="text-crimson-cathedral text-xs" role="alert">{errors.coverageInterest}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="purchaseIntent" className={LABEL_CLASS}>How Serious Are You?</label>
              <select id="purchaseIntent" value={form.purchaseIntent} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("purchaseIntent", e.target.value)} aria-required="true" aria-invalid={!!errors.purchaseIntent} aria-describedby={errors.purchaseIntent ? "intent-error" : undefined} className={selectClass(!!errors.purchaseIntent)}>
                {PURCHASE_INTENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.purchaseIntent && <p id="intent-error" className="text-crimson-cathedral text-xs" role="alert">{errors.purchaseIntent}</p>}
            </div>

            {/* Background — service members, families, and civilians all welcome */}
            <div className="space-y-1">
              <label htmlFor="veteranStatus" className={LABEL_CLASS}>Your Background</label>
              <p className="text-xs text-[var(--text-muted)]" id="veteran-hint">
                Veterans, service members, military families, and civilians are all welcome — we match every request to a licensed professional.
              </p>
              <select id="veteranStatus" value={form.veteranStatus} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} aria-describedby={errors.veteranStatus ? "veteran-error" : "veteran-hint"} className={selectClass(!!errors.veteranStatus)}>
                {MILITARY_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.veteranStatus && <p id="veteran-error" className="text-crimson-cathedral text-xs" role="alert">{errors.veteranStatus}</p>}
            </div>

            {/* Branch of Service — conditional subcategory (shown for all except non-military) */}
            {form.veteranStatus && form.veteranStatus !== "non-military" && form.veteranStatus !== "civilian" && BRANCH_OPTIONS_BY_STATUS[form.veteranStatus] && (
              <div className="space-y-1 animate-in fade-in">
                <label htmlFor="militaryBranch" className={LABEL_CLASS}>Branch of Service</label>
                <select id="militaryBranch" value={form.militaryBranch} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} aria-describedby={errors.militaryBranch ? "branch-error branch-hint" : "branch-hint"} className={selectClass(!!errors.militaryBranch)}>
                  {BRANCH_OPTIONS_BY_STATUS[form.veteranStatus].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p id="branch-hint" className="text-gray-500 text-xs">Thank you for your service.</p>
                {errors.militaryBranch && <p id="branch-error" className="text-crimson-cathedral text-xs" role="alert">{errors.militaryBranch}</p>}
              </div>
            )}

            {/* Next button */}
            <button
              type="button"
              onClick={nextStep}
              className={`w-full ${BTN_PRIMARY}`}
            >
              Continue
            </button>
          </div>
        )}

        {/* --- Step 1: Contact --- */}
        {step === 1 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 2: Contact Information">
            <div className="space-y-1">
              <label htmlFor="email" className={LABEL_CLASS}>Email Address</label>
              <input id="email" type="email" value={form.email} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("email", e.target.value)} placeholder="john.doe@example.com" autoComplete="email" aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={inputClass(!!errors.email)} />
              {errors.email && <p id="email-error" className="text-crimson-cathedral text-xs" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className={LABEL_CLASS}>Phone Number</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} className={inputClass(!!errors.phone)} />
              {errors.phone && <p id="phone-error" className="text-crimson-cathedral text-xs" role="alert">{errors.phone}</p>}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className={`flex-1 ${BTN_BACK}`}
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className={`flex-1 ${BTN_PRIMARY}`}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* --- Step 2: Consent & Submit --- */}
        {step === 2 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 3: Review and Consent">
            {/* Review summary */}
            <div className="bg-gray-50 rounded-[13px] p-4 text-sm space-y-1" role="region" aria-label="Review your information">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Your Information</p>
              <p className="text-black font-medium">{form.firstName} {form.lastName}</p>
              <p className="text-gray-600">DOB: {form.dateOfBirth}</p>
              <p className="text-gray-600">{form.email}</p>
              <p className="text-gray-600">{form.phone}</p>
              <p className="text-gray-600">
                {US_STATES.find(s => s.code === form.state)?.name} &middot;{" "}
                {COVERAGE_OPTIONS.find(o => o.value === form.coverageInterest)?.label}
              </p>
              <p className="text-gray-600">
                {PURCHASE_INTENT_OPTIONS.find(o => o.value === form.purchaseIntent)?.label}
              </p>
              <p className="text-gray-600">
                {MILITARY_STATUS_OPTIONS.find(o => o.value === form.veteranStatus)?.label}
                {form.veteranStatus && form.veteranStatus !== "non-military" && form.veteranStatus !== "civilian" && form.militaryBranch && (
                  <> &middot; {BRANCH_OPTIONS_BY_STATUS[form.veteranStatus]?.find(o => o.value === form.militaryBranch)?.label}</>
                )}
              </p>
              <button
                type="button"
                onClick={() => prevStep()}
                className="text-teal-cathedral text-xs underline mt-1"
              >
                Edit information
              </button>
            </div>

            <div className="border-t border-gray-200 pt-5" />

            {/* TCPA + Privacy Consent */}
            <TcpaConsent
              tcpaChecked={form.tcpaConsent}
              privacyChecked={form.privacyConsent}
              onTcpaChange={(v) => updateField("tcpaConsent", v)}
              onPrivacyChange={(v) => updateField("privacyConsent", v)}
              tcpaError={errors.tcpaConsent}
              privacyError={errors.privacyConsent}
            />

            {/* Server Error */}
            {serverError && (
              <div className="text-crimson-cathedral text-sm text-center py-2" role="alert" aria-live="assertive">{serverError}</div>
            )}

            {/* Missing Fields Summary — shown after submit attempt */}
            {submitAttempted && missingFields.length > 0 && (
              <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4" role="alert" aria-live="assertive" id="missing-fields-summary">
                <p className="text-red-700 font-bold text-sm mb-2">Please complete the following fields before submitting:</p>
                <ul className="list-disc list-inside space-y-1">
                  {missingFields.map((mf) => (
                    <li key={mf.field} className="text-red-600 text-sm">
                      <button
                        type="button"
                        className="text-red-600 underline hover:text-red-800 font-medium"
                        onClick={() => {
                          const targetStep = FIELD_STEP[mf.field];
                          if (targetStep !== step) {
                            goToStep(targetStep);
                          }
                          // Wait for React to render the target step, then scroll + focus
                          setTimeout(() => {
                            const idMap: Record<string, string> = { coverageInterest: "coverage" };
                            const elId = idMap[mf.field] || mf.field;
                            const el = document.getElementById(elId);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              el.focus();
                            }
                          }, 100);
                        }}
                      >
                        {mf.label}
                      </button>
                      <span className="text-red-500 text-xs ml-1">— {mf.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Navigation + Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className={`flex-1 ${BTN_BACK}`}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className={`flex-1 ${BTN_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {loading ? "Submitting..." : "Request My Coverage Review"}
              </button>
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">No pressure. No obligation. Just clear options.</p>
          </div>
        )}
      </form>

      {/* Below-Form Disclaimers */}
      <div className="w-full max-w-lg mt-6 space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
        <p>
          <strong className="text-[var(--text-primary)]">Important:</strong> This website is operated by Valor Legacies
          and is not an insurance company, insurance agent, or insurance broker. We do not provide insurance
          quotes, bind insurance coverage, or provide insurance advice of any kind. Your information will
          be shared with one or more licensed insurance professionals who may contact you. Any insurance
          products or coverage are subject to the terms, conditions, and eligibility requirements of
          the applicable insurance company.
        </p>
        <p>
          Coverage availability, rates, and terms vary by state. Not all applicants will qualify for
          coverage. No guarantee of specific rates or coverage is implied.
        </p>
      </div>

      {/* Solutions remain available, but secondary to life events */}
      <section id="solutions" className="w-full max-w-5xl mt-16 mb-16 px-4" aria-labelledby="solutions-heading">
        <div className="text-center mb-8">
          <h2 id="solutions-heading" className={`${SECTION_HEADING} mb-3`}>Solutions We May Review</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl mx-auto">
            You do not need to know which product is right before you reach out. These are examples of solutions that may be discussed based on your goals.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SOLUTIONS.map((solution) => (
            <div key={solution} className="cathedral-surface p-4 text-center border border-indigo-cathedral/8">
              <p className="text-sm text-[var(--text-primary)] font-medium">{solution}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="resources" className="w-full max-w-5xl mb-16 px-4" aria-labelledby="resources-heading">
        <div className="text-center mb-8">
          <h2 id="resources-heading" className={`${SECTION_HEADING} mb-3`}>Helpful Guides for Life&rsquo;s Biggest Moments</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl mx-auto">
            Educational resources to help families understand coverage decisions without jargon or pressure.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {RESOURCE_GUIDES.map((guide) => (
            <a key={guide} href="/resources" className="cathedral-surface p-5 rounded-[13px] hover:border-teal-cathedral/45 transition-all">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">{guide}</h3>
              <span className="text-xs text-teal-cathedral font-medium">Read the guide</span>
            </a>
          ))}
        </div>
      </section>

      <section id="about" className="w-full max-w-4xl mb-16 px-4" aria-labelledby="about-heading">
        <div className="cathedral-surface p-6 md:p-8 text-center">
          <h2 id="about-heading" className={`${SECTION_HEADING} mb-5`}>Veteran-Founded. Family-Focused. Independent.</h2>
          <ImageUpload
            slot="veteran-group"
            alt="Valor Legacies veteran-founded mission photo"
            editable={false}
            className="w-full max-w-xl mx-auto mb-6 rounded-lg bg-[var(--bg-surface)] border border-teal-cathedral/20 flex items-center justify-center overflow-hidden"
            imgClassName="w-full h-auto object-cover rounded-lg"
            fallback={
              <div className="w-full h-40 flex items-center justify-center text-center px-6">
                <p className="text-sm metallic-gold">Founded by a veteran. Built to help families protect every chapter.</p>
              </div>
            }
          />
          <p className="text-sm md:text-base text-[var(--text-muted)] leading-relaxed max-w-3xl mx-auto">
            Valor Legacies was created to help families make confident decisions during life&rsquo;s most important transitions.
            Founded by a veteran, our mission is rooted in service, protection, and legacy. We are independent, which means
            we are not limited to one insurance company. We help families compare options from multiple highly rated carriers
            to find protection that fits their life, budget, and goals.
          </p>
        </div>
      </section>

      {/* Do Not Sell Link — CCPA Compliance */}
      <div className="w-full max-w-lg mt-4 text-center">
        <a href="/privacy#do-not-sell" className="text-xs text-teal-cathedral underline">
          Do Not Sell or Share My Personal Information
        </a>
      </div>

      {/* Trust Signals — Social Proof & How It Works */}
      <div className="w-full flex justify-center mt-16 px-4">
        <TrustSignals />
      </div>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center flex-wrap">
          {FOOTER_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-teal-cathedral/70 hover:text-teal-cathedral">{l.label}</a>
          ))}
        </nav>
        <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
      </footer>
    </main>
  );
}
