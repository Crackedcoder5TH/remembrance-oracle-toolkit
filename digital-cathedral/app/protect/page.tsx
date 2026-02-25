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

const INPUT_CLASS =
  "w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all";

const SELECT_CLASS = INPUT_CLASS + " appearance-none";

export default function ProtectPage() {
  const utm = useUtmTracking();
  const {
    form, errors, loading, submitted, whisper, serverError,
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

  // --- Submitted state ---
  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12" aria-label="Form submission confirmation">
        <div className="w-full max-w-lg cathedral-surface p-8 cathedral-glow text-center" role="status">
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-4 pulse-gentle">
            Covenant Received
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-4">
            Your Legacy is Being Protected
          </h1>
          <p className="whisper-text text-lg leading-relaxed mb-6">
            &ldquo;{whisper}&rdquo;
          </p>
          <p className="text-[var(--text-muted)] text-sm">
            A licensed insurance professional will contact you within 1 business day
            to discuss your coverage options. Check your email for confirmation.
          </p>
        </div>
        <footer className="mt-16 text-center text-xs text-[var(--text-muted)]">
          <p>The kingdom protects what matters. Remember.</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Header */}
      <header className="text-center mb-10">
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          The Protection Covenant
        </div>
        <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] mb-4">
          Protect Your Legacy
        </h1>
        <p className="text-[var(--text-muted)] max-w-md mx-auto text-sm leading-relaxed">
          Speak your intention. Tell us about yourself, and a licensed life insurance
          professional will connect with you to explore the coverage that fits your needs.
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
      <form onSubmit={handleSubmit} className="w-full max-w-lg cathedral-surface p-6 md:p-8 space-y-6" noValidate aria-label="Life insurance quote request form">
        {/* Step Progress Indicator */}
        <StepProgress currentStep={step} totalSteps={totalSteps} />

        {/* --- Step 0: Identity --- */}
        {step === 0 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 1: Your Identity">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="firstName" className="block text-sm text-[var(--text-muted)]">First Name</label>
                <input id="firstName" type="text" value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} placeholder="John" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} className={INPUT_CLASS} />
                {errors.firstName && <p id="firstName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.firstName}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="lastName" className="block text-sm text-[var(--text-muted)]">Last Name</label>
                <input id="lastName" type="text" value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} className={INPUT_CLASS} />
                {errors.lastName && <p id="lastName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.lastName}</p>}
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
              {errors.dateOfBirth && <p id="dob-error" className="text-crimson-cathedral text-xs" role="alert">{errors.dateOfBirth}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="state" className="block text-sm text-[var(--text-muted)]">State</label>
              <select id="state" value={form.state} onChange={(e) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} aria-describedby={errors.state ? "state-error" : undefined} className={SELECT_CLASS}>
                <option value="">Select your state...</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              {errors.state && <p id="state-error" className="text-crimson-cathedral text-xs" role="alert">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="coverage" className="block text-sm text-[var(--text-muted)]">Coverage Interest</label>
              <select id="coverage" value={form.coverageInterest} onChange={(e) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : undefined} className={SELECT_CLASS}>
                {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.coverageInterest && <p id="coverage-error" className="text-crimson-cathedral text-xs" role="alert">{errors.coverageInterest}</p>}
            </div>

            {/* Veteran Status */}
            <div className="space-y-1">
              <label htmlFor="veteranStatus" className="block text-sm text-[var(--text-muted)]">Veteran Status</label>
              <select id="veteranStatus" value={form.veteranStatus} onChange={(e) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} aria-describedby={errors.veteranStatus ? "veteran-error" : undefined} className={SELECT_CLASS}>
                {VETERAN_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.veteranStatus && <p id="veteran-error" className="text-crimson-cathedral text-xs" role="alert">{errors.veteranStatus}</p>}
            </div>

            {/* Military Branch — conditional subcategory (only shown for veterans) */}
            {form.veteranStatus === "veteran" && (
              <div className="space-y-1 animate-in fade-in">
                <label htmlFor="militaryBranch" className="block text-sm text-[var(--text-muted)]">Branch of Service</label>
                <select id="militaryBranch" value={form.militaryBranch} onChange={(e) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} aria-describedby={errors.militaryBranch ? "branch-error branch-hint" : "branch-hint"} className={SELECT_CLASS}>
                  {MILITARY_BRANCH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p id="branch-hint" className="text-[var(--text-muted)] text-xs">Thank you for your service.</p>
                {errors.militaryBranch && <p id="branch-error" className="text-crimson-cathedral text-xs" role="alert">{errors.militaryBranch}</p>}
              </div>
            )}

            {/* Next button */}
            <button
              type="button"
              onClick={nextStep}
              className="w-full py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]"
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
              {errors.email && <p id="email-error" className="text-crimson-cathedral text-xs" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className="block text-sm text-[var(--text-muted)]">Phone Number</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} className={INPUT_CLASS} />
              {errors.phone && <p id="phone-error" className="text-crimson-cathedral text-xs" role="alert">{errors.phone}</p>}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-[var(--text-muted)] border border-teal-cathedral/10 hover:border-teal-cathedral/30"
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]"
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
                className="text-teal-cathedral text-xs underline mt-1"
              >
                Edit information
              </button>
            </div>

            <div className="border-t border-teal-cathedral/10 pt-5" />

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

            {/* Navigation + Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-[var(--text-muted)] border border-teal-cathedral/10 hover:border-teal-cathedral/30"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Submitting..." : "Protect My Legacy"}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Below-Form Disclaimers */}
      <div className="w-full max-w-lg mt-6 space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
        <p>
          <strong className="text-[var(--text-primary)]">Important:</strong> This website is operated by [Company Name]
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
        <nav className="flex gap-4 justify-center">
          <a href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Privacy Policy</a>
          <a href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Terms of Service</a>
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Home</a>
        </nav>
        <p>The kingdom protects what matters. Remember.</p>
        <p>&copy; {new Date().getFullYear()} [Company Name]. All rights reserved.</p>
      </footer>
    </main>
  );
}
