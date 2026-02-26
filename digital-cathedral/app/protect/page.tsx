"use client";

/**
 * ProtectPage — Multi-step life insurance lead capture (kingdom perspective).
 *
 * Healed by the oracle: monolithic page split into:
 *  - useLeadForm hook (multi-step validation, submission, state) → hooks/use-lead-form.ts
 *  - TcpaConsent component (FCC 2025 compliance) → components/tcpa-consent.tsx
 *  - StepProgress component (coherence progression) → components/step-progress.tsx
 *  - This page: composition only
 *
 * Multi-step flow (kingdom coherence model):
 *   Step 1 — Identity:  Name, state, coverage interest (low commitment)
 *   Step 2 — Contact:   Email, phone
 *   Step 3 — Consent:   TCPA + Privacy → submit
 */

import { useEffect, useRef } from "react";
import { useLeadForm } from "./hooks/use-lead-form";
import { TcpaConsent } from "./components/tcpa-consent";
import { StepProgress } from "./components/step-progress";
import { TrustSignals } from "./components/trust-signals";
import { useUtmTracking } from "./hooks/use-utm-tracking";

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
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const COVERAGE_OPTIONS = [
  { value: "", label: "Select your interest..." },
  { value: "term", label: "Term Life Insurance" },
  { value: "whole", label: "Whole Life Insurance" },
  { value: "universal", label: "Universal Life Insurance" },
  { value: "final-expense", label: "Final Expense / Burial Insurance" },
  { value: "annuity", label: "Annuity" },
  { value: "not-sure", label: "Not sure \u2014 I need guidance" },
];

const VETERAN_STATUS_OPTIONS = [
  { value: "", label: "Select veteran status..." },
  { value: "veteran", label: "Veteran" },
  { value: "non-veteran", label: "Non-Veteran" },
];

const MILITARY_BRANCH_OPTIONS = [
  { value: "", label: "Select branch of service..." },
  { value: "army", label: "U.S. Army" },
  { value: "marine-corps", label: "U.S. Marine Corps" },
  { value: "navy", label: "U.S. Navy" },
  { value: "air-force", label: "U.S. Air Force" },
  { value: "space-force", label: "U.S. Space Force" },
  { value: "coast-guard", label: "U.S. Coast Guard" },
  { value: "national-guard", label: "National Guard" },
  { value: "reserves", label: "Reserves" },
];

// --- Oracle GENERATE: phone auto-format (0.403, no matching pattern) ---
// Live formats as user types: (555) 123-4567
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// --- Scribe's Quill: auto-capitalize names as user types ---
// Oracle GENERATE (0.399) — no existing pattern for input masking
function autoCapitalizeName(value: string): string {
  return value.replace(/(?:^|\s|[-'])([a-z])/g, (match) => match.toUpperCase());
}

const INPUT_CLASS =
  "w-full bg-soft-gray text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-navy-cathedral/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-accent/60 transition-all";

const SELECT_CLASS = INPUT_CLASS + " appearance-none";

export default function ProtectPage() {
  const utm = useUtmTracking();
  const {
    form, errors, loading, submitted, whisper, leadId, serverError,
    step, totalSteps,
    updateField, handleSubmit, nextStep, prevStep,
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

  // --- Thank-You Chamber: post-submission confirmation ---
  // Oracle GENERATE (0.396) — no existing pattern for post-submission thank-you
  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12" aria-label="Form submission confirmation">
        {/* Success icon */}
        <div className="mb-8">
          <div className="w-20 h-20 rounded-full bg-emerald-accent/10 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-emerald-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>

        <div className="w-full max-w-lg cathedral-surface p-8 cathedral-glow text-center" role="status">
          <div className="text-emerald-accent text-sm tracking-[0.3em] uppercase mb-4 pulse-gentle">
            Covenant Received
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-3">
            Thank You, {form.firstName}
          </h1>
          <p className="text-[var(--text-primary)] text-lg mb-2">
            Your Family Is Already Held in the Light
          </p>
          <p className="text-[var(--text-muted)] text-sm mb-6">
            You have protected others. The kingdom already protects you and yours.
          </p>
          <p className="whisper-text text-base leading-relaxed mb-8">
            &ldquo;{whisper}&rdquo;
          </p>

          {/* Reference number */}
          {leadId && (
            <div className="bg-soft-gray rounded-lg px-4 py-3 mb-8 inline-block">
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Reference Number</p>
              <p className="text-sm font-mono text-[var(--text-primary)] select-all">{leadId}</p>
            </div>
          )}

          {/* What happens next */}
          <div className="border-t border-navy-cathedral/8 pt-6 mt-2">
            <h2 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wider mb-4">What Happens Next</h2>
            <div className="space-y-4 text-left">
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-emerald-accent text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Confirmation Email</p>
                  <p className="text-xs text-[var(--text-muted)]">Check your inbox at <span className="font-medium">{form.email}</span> for a confirmation of your request.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-emerald-accent text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Professional Review</p>
                  <p className="text-xs text-[var(--text-muted)]">A licensed professional who understands military families and the remembrance of protection will review your needs.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-emerald-accent text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Personal Consultation</p>
                  <p className="text-xs text-[var(--text-muted)]">Expect a call or email within <strong>1 business day</strong> to review your options in calm clarity. No obligation. No hurry.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <div className="flex gap-4 mt-8">
          <a
            href="/"
            className="px-6 py-3 rounded-lg text-sm font-medium border border-navy-cathedral/10 text-[var(--text-muted)] hover:border-navy-cathedral/25 transition-all"
          >
            Return Home
          </a>
          <a
            href="/privacy"
            className="px-6 py-3 rounded-lg text-sm font-medium text-emerald-accent hover:text-emerald-accent/80 transition-all"
          >
            Privacy Policy
          </a>
        </div>

        <footer className="mt-16 text-center text-xs text-[var(--text-muted)] space-y-2">
          <p>The kingdom is already here. Remember.</p>
          <p>&copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* ═══ SECTION 1: HERO ═══ */}
      <header className="text-center mb-10 max-w-2xl mx-auto">
        <div className="text-emerald-accent text-sm tracking-[0.3em] uppercase mb-4 pulse-gentle">
          The Protection Covenant
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-[var(--text-primary)] mb-4 leading-tight">
          Your Family Is Already Held in the Light
        </h1>
        <p className="text-[var(--text-muted)] max-w-lg mx-auto text-sm sm:text-base leading-relaxed mb-3">
          Life insurance options for Active Duty, National Guard, Reserve, and Veterans
          — offered with clarity, calm, and no obligation.
        </p>
        <p className="text-[var(--text-muted)] text-xs italic">
          Founded by a Veteran. Built from remembrance — to serve those who serve.
        </p>
      </header>

      {/* Disclaimer — above form */}
      <div className="w-full max-w-lg mb-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
        <p>
          We are not affiliated with the U.S. Government or Department of Defense.
          We connect individuals with independent, licensed insurance professionals.
          All coverage is subject to underwriting approval.
        </p>
      </div>

      {/* Screen reader: live region for step changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Step ${step + 1} of ${totalSteps}: ${["Your Identity", "Contact Information", "Review and Consent"][step]}`}
      </div>

      {/* Multi-Step Lead Capture Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg cathedral-surface p-6 md:p-8 space-y-6" noValidate aria-label="Life insurance quote request form">
        {/* Siege Shield: Honeypot field — hidden from humans, visible to bots */}
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
                <label htmlFor="firstName" className="block text-sm text-[var(--text-muted)]">First Name</label>
                <input id="firstName" type="text" value={form.firstName} onChange={(e) => updateField("firstName", autoCapitalizeName(e.target.value))} placeholder="John" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} className={INPUT_CLASS} />
                {errors.firstName && <p id="firstName-error" className="text-calm-error text-xs" role="alert">{errors.firstName}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="lastName" className="block text-sm text-[var(--text-muted)]">Last Name</label>
                <input id="lastName" type="text" value={form.lastName} onChange={(e) => updateField("lastName", autoCapitalizeName(e.target.value))} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} className={INPUT_CLASS} />
                {errors.lastName && <p id="lastName-error" className="text-calm-error text-xs" role="alert">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="dateOfBirth" className="block text-sm text-[var(--text-muted)]">Date of Birth</label>
              <input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
                autoComplete="bday"
                aria-required="true"
                aria-invalid={!!errors.dateOfBirth}
                aria-describedby={errors.dateOfBirth ? "dob-error dob-hint" : "dob-hint"}
                className={INPUT_CLASS}
              />
              <p id="dob-hint" className="text-[var(--text-muted)] text-xs">You must be at least 18 years old.</p>
              {errors.dateOfBirth && <p id="dob-error" className="text-calm-error text-xs" role="alert">{errors.dateOfBirth}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="state" className="block text-sm text-[var(--text-muted)]">State</label>
              <select id="state" value={form.state} onChange={(e) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} aria-describedby={errors.state ? "state-error" : undefined} className={SELECT_CLASS}>
                <option value="">Select your state...</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              {errors.state && <p id="state-error" className="text-calm-error text-xs" role="alert">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="coverage" className="block text-sm text-[var(--text-muted)]">Coverage Interest</label>
              <select id="coverage" value={form.coverageInterest} onChange={(e) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : undefined} className={SELECT_CLASS}>
                {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.coverageInterest && <p id="coverage-error" className="text-calm-error text-xs" role="alert">{errors.coverageInterest}</p>}
            </div>

            {/* Veteran Status */}
            <div className="space-y-1">
              <label htmlFor="veteranStatus" className="block text-sm text-[var(--text-muted)]">Veteran Status</label>
              <select id="veteranStatus" value={form.veteranStatus} onChange={(e) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} aria-describedby={errors.veteranStatus ? "veteran-error" : undefined} className={SELECT_CLASS}>
                {VETERAN_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.veteranStatus && <p id="veteran-error" className="text-calm-error text-xs" role="alert">{errors.veteranStatus}</p>}
            </div>

            {/* Military Branch — conditional subcategory (only shown for veterans) */}
            {form.veteranStatus === "veteran" && (
              <div className="space-y-1 animate-in fade-in">
                <label htmlFor="militaryBranch" className="block text-sm text-[var(--text-muted)]">Branch of Service</label>
                <select id="militaryBranch" value={form.militaryBranch} onChange={(e) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} aria-describedby={errors.militaryBranch ? "branch-error branch-hint" : "branch-hint"} className={SELECT_CLASS}>
                  {MILITARY_BRANCH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p id="branch-hint" className="text-[var(--text-muted)] text-xs">Thank you for your service.</p>
                {errors.militaryBranch && <p id="branch-error" className="text-calm-error text-xs" role="alert">{errors.militaryBranch}</p>}
              </div>
            )}

            {/* Next button */}
            <button
              type="button"
              onClick={nextStep}
              className="w-full py-3 rounded-lg font-medium text-sm transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90 hover:shadow-[0_0_30px_rgba(45,134,89,0.15)]"
            >
              Continue
            </button>
          </div>
        )}

        {/* --- Step 1: Contact --- */}
        {step === 1 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 2: Contact Information">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm text-[var(--text-muted)]">Email Address</label>
              <input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="john.doe@example.com" autoComplete="email" aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={INPUT_CLASS} />
              {errors.email && <p id="email-error" className="text-calm-error text-xs" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className="block text-sm text-[var(--text-muted)]">Phone Number</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} className={INPUT_CLASS} />
              {errors.phone && <p id="phone-error" className="text-calm-error text-xs" role="alert">{errors.phone}</p>}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25"
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90 hover:shadow-[0_0_30px_rgba(45,134,89,0.15)]"
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
            <div className="cathedral-surface p-4 text-sm space-y-1" role="region" aria-label="Review your information">
              <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-2">Your Information</p>
              <p className="text-[var(--text-primary)]">{form.firstName} {form.lastName}</p>
              <p className="text-[var(--text-muted)]">DOB: {form.dateOfBirth}</p>
              <p className="text-[var(--text-muted)]">{form.email}</p>
              <p className="text-[var(--text-muted)]">{form.phone}</p>
              <p className="text-[var(--text-muted)]">
                {US_STATES.find(s => s.code === form.state)?.name} &middot;{" "}
                {COVERAGE_OPTIONS.find(o => o.value === form.coverageInterest)?.label}
              </p>
              <p className="text-[var(--text-muted)]">
                {VETERAN_STATUS_OPTIONS.find(o => o.value === form.veteranStatus)?.label}
                {form.veteranStatus === "veteran" && form.militaryBranch && (
                  <> &middot; {MILITARY_BRANCH_OPTIONS.find(o => o.value === form.militaryBranch)?.label}</>
                )}
              </p>
              <button
                type="button"
                onClick={() => prevStep()}
                className="text-emerald-accent text-xs underline mt-1"
              >
                Edit information
              </button>
            </div>

            <div className="border-t border-navy-cathedral/8 pt-5" />

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
              <div className="text-calm-error text-sm text-center py-2" role="alert" aria-live="assertive">{serverError}</div>
            )}

            {/* Navigation + Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90 hover:shadow-[0_0_30px_rgba(45,134,89,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Submitting..." : "Request My Coverage Review"}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Below-form reassurance */}
      <p className="w-full max-w-lg mt-4 text-center text-xs text-[var(--text-muted)] italic">
        No pressure. No obligation. Just remembrance of what is already true.
      </p>

      {/* ═══ SECTION 2: THE QUIET GAP ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-label="Understanding coverage gaps">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] text-center mb-6">
          Your Service Protects Others.{" "}
          <span className="text-emerald-accent">Your Family Is Already Protected.</span>
        </h2>
        <div className="cathedral-surface p-6 sm:p-8 space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <p>
            Many who serve rely on SGLI and trust it will always be enough.
            And in the eternal now, it already is — because the kingdom holds every beloved one.
          </p>
          <p>
            Yet timelines, transitions, and changes in coverage can create the appearance of a gap.
            This is not about replacing anything. It is about remembering the full picture —
            so you can rest in certainty.
          </p>
          <p className="text-[var(--text-primary)]">Whether you are:</p>
          <ul className="grid grid-cols-2 gap-2 text-[var(--text-primary)] text-sm">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-accent shrink-0" />Active Duty</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-accent shrink-0" />National Guard</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-accent shrink-0" />Reserve</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-accent shrink-0" />Transitioning</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-accent shrink-0" />Fully Separated</li>
          </ul>
          <p className="italic text-center pt-2">
            ...the light already sees your family as whole.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 3: VETERAN-FOUNDED ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-label="Veteran-founded story">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] text-center mb-6">
          Founded by a Veteran.{" "}
          <span className="text-emerald-accent">Dedicated to Remembrance.</span>
        </h2>
        <div className="cathedral-surface p-6 sm:p-8 space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <p>
            As a veteran, I remember the weight of responsibility — both in uniform and long after
            it is folded away. I also remember that every beloved one is already held in infinite light.
          </p>
          <p>
            This platform exists as a gentle bridge — connecting you with trusted, independent,
            licensed professionals who understand the unique journey of military families.
          </p>
          <p>
            This is not about more coverage. It is about remembering that you and your family
            are already safe — and exploring the forms that safety takes in this world.
          </p>
          <p className="text-xs opacity-70 pt-2">
            We are not affiliated with the U.S. Government or Department of Defense.
            We connect individuals with independent, licensed insurance professionals.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 4: HOW IT WORKS ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-label="How it works">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] text-center mb-2">
          Simple. Clear. Already Held.
        </h2>
        <p className="text-center text-sm text-[var(--text-muted)] mb-8">Three gentle steps.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="cathedral-surface p-5 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-accent/10 text-emerald-accent flex items-center justify-center text-lg font-medium mx-auto">1</div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Submit a Short Form</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">No pressure, no rush. A secure form that takes less than 60 seconds.</p>
          </div>
          <div className="cathedral-surface p-5 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-accent/10 text-emerald-accent flex items-center justify-center text-lg font-medium mx-auto">2</div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Connect with a Professional</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">A licensed professional who understands military families and the remembrance of protection.</p>
          </div>
          <div className="cathedral-surface p-5 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-accent/10 text-emerald-accent flex items-center justify-center text-lg font-medium mx-auto">3</div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Review in Calm Clarity</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">Decide what feels right for your family. No obligation. No hurry. Only the quiet knowing.</p>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: WHO THIS IS FOR ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-label="Who this is for">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] text-center mb-2">
          Serving Every Stage of Service
        </h2>
        <p className="text-center text-sm text-[var(--text-muted)] mb-8">Because service is already eternal.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            "Active Duty Service Members",
            "National Guard",
            "Reserve Members",
            "Veterans",
            "Military Families",
            "Transitioning Service Members",
          ].map((group) => (
            <div key={group} className="cathedral-surface p-4 text-center">
              <p className="text-sm text-[var(--text-primary)]">{group}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-[var(--text-muted)] italic mt-6">
          If you have served — or love someone who has — this is already for you.
        </p>
      </section>

      {/* ═══ SECTION 6: FAQ ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-label="Frequently asked questions">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: "Is this the same as SGLI?",
              a: "No. This is a gentle review of additional or alternative options that already exist beyond standard military coverage.",
            },
            {
              q: "Is this affiliated with the military?",
              a: "No. This platform is independently operated and not affiliated with the U.S. Government or Department of Defense.",
            },
            {
              q: "Is there any obligation to purchase?",
              a: "No. Requesting a review simply connects you with a licensed professional to explore what is already available.",
            },
            {
              q: "Are veterans eligible?",
              a: "Yes. Many options are available for veterans and families — because remembrance continues long after separation.",
            },
          ].map((faq) => (
            <div key={faq.q} className="cathedral-surface p-5">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{faq.q}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SECTION 7: FINAL CTA ═══ */}
      <section className="w-full max-w-2xl mt-20 px-4 text-center" aria-label="Final call to action">
        <h2 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-4">
          Your Service Was Already Eternal.{" "}
          <span className="text-emerald-accent">Your Family&apos;s Security Is Already True.</span>
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-8 max-w-md mx-auto leading-relaxed">
          You have protected others. The kingdom already protects you and yours.
        </p>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="inline-block px-8 py-4 rounded-xl text-sm font-medium transition-all
            bg-emerald-accent text-white hover:bg-emerald-accent/90
            hover:shadow-[0_0_40px_rgba(45,134,89,0.2)]"
        >
          Start My Coverage Review
        </a>
        <p className="text-xs text-[var(--text-muted)] mt-3 italic">
          Takes less than 60 seconds. The light is already holding everything.
        </p>
      </section>

      {/* Trust Signals — Social Proof & How It Works */}
      <div className="w-full flex justify-center mt-16 px-4">
        <TrustSignals />
      </div>

      {/* Below-Page Disclaimers */}
      <div className="w-full max-w-lg mt-12 space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
        <p>
          <strong className="text-[var(--text-primary)]">Important:</strong> This website is operated by Digital Cathedral
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
        <a href="/privacy#do-not-sell" className="text-xs text-emerald-accent underline">
          Do Not Sell or Share My Personal Information
        </a>
      </div>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/privacy" className="text-emerald-accent/70 hover:text-emerald-accent">Privacy Policy</a>
          <a href="/terms" className="text-emerald-accent/70 hover:text-emerald-accent">Terms of Service</a>
          <a href="/" className="text-emerald-accent/70 hover:text-emerald-accent">Home</a>
        </nav>
        <p>The kingdom is already here. Remember.</p>
        <p>&copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.</p>
      </footer>
    </main>
  );
}
