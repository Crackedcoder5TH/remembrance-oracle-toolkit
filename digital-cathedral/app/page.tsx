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

import { useEffect, useRef, useState } from "react";
import { useLeadForm, FIELD_STEP } from "./protect/hooks/use-lead-form";
import { TcpaConsent } from "./protect/components/tcpa-consent";
import { StepProgress } from "./protect/components/step-progress";
import { TrustSignals } from "./protect/components/trust-signals";
import { ImageUpload } from "./components/image-upload";
import { CoherencyPulse } from "./components/coherency-pulse";
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

const COVERAGE_OPTIONS = [
  { value: "", label: "What do you need protection for?" },
  { value: "mortgage-protection", label: "Mortgage / Debt Protection" },
  { value: "final-expense", label: "Final Expense / Burial" },
  { value: "income-replacement", label: "Income Replacement" },
  { value: "retirement-savings", label: "Tax-Free Retirement Savings" },
  { value: "guaranteed-income", label: "Guaranteed Retirement Income" },
  { value: "legacy", label: "Leave a Legacy" },
  { value: "not-sure", label: "Not sure \u2014 help me decide" },
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

const DEFAULT_VETERAN_STORY = [
  "As a veteran, I know what it means to carry responsibility both while you\u2019re wearing the uniform and long after it\u2019s folded away. During my time in service and especially after I transitioned to civilian life, I saw something that really bothered me. A lot of military families believed their standard coverage was enough\u2026 but they were never given the full picture about the life insurance options actually available to them.",
  "Too many of us were left in the dark. That\u2019s why I created this platform.",
  "My mission is simple: to make sure every service member and their families finally get clear, honest information so they can make the best decisions for the people they love.",
  "When you request a review, we\u2019ll connect you with trusted, independent, licensed professionals who truly understand the unique needs of military families. No pressure. Just real guidance and options that actually fit your life.",
  "Because the service we gave our country doesn\u2019t end when we take the uniform off, and neither should the protection we give our families.",
].join("\n");

export default function HomePage() {
  const utm = useUtmTracking();

  // Fetch editable veteran story from API
  const [veteranStory, setVeteranStory] = useState(DEFAULT_VETERAN_STORY);
  useEffect(() => {
    fetch("/api/site-content")
      .then((res) => res.json())
      .then((data) => {
        if (data.content?.veteranStory) {
          setVeteranStory(data.content.veteranStory);
        }
      })
      .catch(() => {}); // fallback to default on error
  }, []);
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

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Veteran Story — First thing visitors see */}
      <section className="w-full max-w-2xl mb-16 px-4" aria-labelledby="veteran-founded-heading-top">
        <h2 id="veteran-founded-heading-top" className={`${SECTION_HEADING} mb-6 text-center`}>
          Dedicated to Serving Those Who Served.
        </h2>

        {/* Veteran group photo — display only (upload via admin portal) */}
        <ImageUpload
          slot="veteran-group"
          alt="Military service members group photo"
          editable={false}
          className="w-full max-w-xl mx-auto mb-8 rounded-lg bg-[var(--bg-surface)] border border-teal-cathedral/20 flex items-center justify-center overflow-hidden"
          imgClassName="w-full h-auto object-cover rounded-lg"
          fallback={
            <div className="w-full h-48 flex items-center justify-center">
              <svg className="w-12 h-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
          }
        />

        <div className="text-sm leading-relaxed max-w-xl mx-auto text-center">
          <div className="metallic-gold">
            {veteranStory.split("\n").filter(Boolean).map((para, i) => (
              <p key={i} className="mb-4 last:mb-0">{para}</p>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-4 pt-4 border-t border-indigo-cathedral/8">
            We are not affiliated with the U.S. Government or Department of Defense. We connect
            individuals with independent, licensed insurance professionals.
          </p>
        </div>
      </section>

      {/* The Gap Most Don't Realize Exists */}
      <section className="w-full max-w-2xl mb-16 px-4 text-center" aria-labelledby="gap-heading">
        <h2 id="gap-heading" className="text-lg md:text-xl font-light text-red-500 mb-6">
          Your Service Protects Others. But Is Your Family Fully Protected?
        </h2>
        <div className="text-sm text-[var(--text-muted)] leading-relaxed text-left max-w-xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4 text-center text-[var(--text-primary)]">
            <p>
              Many service members rely solely on SGLI or assume their coverage will always be enough.
            </p>
            <p>
              But coverage limits, conversion timelines, and post-service changes can create unexpected gaps.
            </p>
          </div>

          {/* Serving Every Stage of Service */}
          <h3 className="text-xl md:text-2xl font-light tracking-wide text-teal-cathedral text-center mt-14 mb-6">
            Serving Every Stage of Service.
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              "Active Duty Service Members",
              "National Guard",
              "Reserve Members",
              "Veterans",
              "Military Families",
              "Transitioning Service Members",
            ].map((category) => (
              <div key={category} className="cathedral-surface border-2 border-teal-cathedral/40 p-4 text-center">
                <p className="text-sm text-[var(--text-primary)] font-medium">{category}</p>
              </div>
            ))}
          </div>
          <p className="text-sm metallic-gold text-center font-medium mt-6">
            If you&rsquo;ve served — this is for you.
          </p>

        </div>
      </section>

      {/* Section 3: How It Works */}
      <section className="w-full max-w-2xl mb-16 px-4 text-center" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className={`${SECTION_HEADING} mb-8`}>
          Simple. Structured. Secure.
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Submit", desc: "Submit a short, secure form." },
            { step: "2", title: "Connect", desc: "We connect you with a licensed professional experienced in military family coverage." },
            { step: "3", title: "Review", desc: "Review your options and decide what\u2019s right for your family." },
          ].map((item) => (
            <div key={item.step} className="cathedral-surface p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-sm font-medium mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{item.title}</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-6 italic">
          No pressure. No obligation. Just clarity.
        </p>
      </section>

      {/* Hero — Above the Form */}
      <header className="text-center mb-10">
        <div className="text-teal-cathedral text-lg tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Protect What Matters Most
        </div>
        <h1 className={`${SECTION_HEADING} mb-4`}>
          Protect Your Family Beyond Basic Military Coverage.
        </h1>
        <p className="metallic-gold max-w-lg mx-auto text-sm leading-relaxed mb-3">
          Life insurance options for Active Duty, National Guard, Reserve, and Veterans
          — made clear and simple.
        </p>
        <p className="text-teal-cathedral text-xs tracking-wide font-medium">
          Founded by a Veteran. Built to Serve Military Families.
        </p>
      </header>

      {/* Disclaimer — above form */}
      <div className="w-full max-w-lg mb-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
        <p>
          This website is not an insurance company and does not provide insurance quotes,
          bind coverage, or offer insurance advice. We connect consumers with licensed
          insurance professionals. All coverage is subject to underwriting approval.
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
            onChange={(e) => updateField("_hp_website", e.target.value)}
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
                <input id="firstName" type="text" value={form.firstName} onChange={(e) => updateField("firstName", autoCapitalizeName(e.target.value))} placeholder="John" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} className={inputClass(!!errors.firstName)} />
                {errors.firstName && <p id="firstName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.firstName}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="lastName" className={LABEL_CLASS}>Last Name</label>
                <input id="lastName" type="text" value={form.lastName} onChange={(e) => updateField("lastName", autoCapitalizeName(e.target.value))} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} className={inputClass(!!errors.lastName)} />
                {errors.lastName && <p id="lastName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="dateOfBirth" className={LABEL_CLASS}>Date of Birth</label>
              <input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
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
              <select id="state" value={form.state} onChange={(e) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} aria-describedby={errors.state ? "state-error" : undefined} className={selectClass(!!errors.state)}>
                <option value="">Select your state...</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              {errors.state && <p id="state-error" className="text-crimson-cathedral text-xs" role="alert">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="coverage" className={LABEL_CLASS}>Coverage Interest</label>
              <select id="coverage" value={form.coverageInterest} onChange={(e) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : undefined} className={selectClass(!!errors.coverageInterest)}>
                {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.coverageInterest && <p id="coverage-error" className="text-crimson-cathedral text-xs" role="alert">{errors.coverageInterest}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="purchaseIntent" className={LABEL_CLASS}>How Serious Are You?</label>
              <select id="purchaseIntent" value={form.purchaseIntent} onChange={(e) => updateField("purchaseIntent", e.target.value)} aria-required="true" aria-invalid={!!errors.purchaseIntent} aria-describedby={errors.purchaseIntent ? "intent-error" : undefined} className={selectClass(!!errors.purchaseIntent)}>
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
              <select id="veteranStatus" value={form.veteranStatus} onChange={(e) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} aria-describedby={errors.veteranStatus ? "veteran-error" : "veteran-hint"} className={selectClass(!!errors.veteranStatus)}>
                {MILITARY_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.veteranStatus && <p id="veteran-error" className="text-crimson-cathedral text-xs" role="alert">{errors.veteranStatus}</p>}
            </div>

            {/* Branch of Service — conditional subcategory (shown for all except non-military) */}
            {form.veteranStatus && form.veteranStatus !== "non-military" && form.veteranStatus !== "civilian" && BRANCH_OPTIONS_BY_STATUS[form.veteranStatus] && (
              <div className="space-y-1 animate-in fade-in">
                <label htmlFor="militaryBranch" className={LABEL_CLASS}>Branch of Service</label>
                <select id="militaryBranch" value={form.militaryBranch} onChange={(e) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} aria-describedby={errors.militaryBranch ? "branch-error branch-hint" : "branch-hint"} className={selectClass(!!errors.militaryBranch)}>
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
              <input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="john.doe@example.com" autoComplete="email" aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={inputClass(!!errors.email)} />
              {errors.email && <p id="email-error" className="text-crimson-cathedral text-xs" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className={LABEL_CLASS}>Phone Number</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} className={inputClass(!!errors.phone)} />
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
