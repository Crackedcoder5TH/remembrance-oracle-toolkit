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

import { useEffect, useRef } from "react";
import { useLeadForm } from "./protect/hooks/use-lead-form";
import { TcpaConsent } from "./protect/components/tcpa-consent";
import { StepProgress } from "./protect/components/step-progress";
import { TrustSignals } from "./protect/components/trust-signals";
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
  "w-full bg-gray-50 text-black placeholder-gray-400 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all";

const SELECT_CLASS = INPUT_CLASS + " appearance-none";

export default function HomePage() {
  const utm = useUtmTracking();
  const {
    form, errors, loading, submitted, confirmationMessage, leadId, serverError,
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
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Confirmation Email</p>
                  <p className="text-xs text-[var(--text-muted)]">Check your inbox at <span className="font-medium">{form.email}</span> for a confirmation of your request.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Professional Review</p>
                  <p className="text-xs text-[var(--text-muted)]">A licensed insurance professional in your area will review your information and coverage needs.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-teal-cathedral text-white flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</div>
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-medium">Personal Consultation</p>
                  <p className="text-xs text-[var(--text-muted)]">Expect a call or email within <strong>1 business day</strong> to discuss your options — no obligation.</p>
                </div>
              </div>
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
          <p>&copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.</p>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Veteran Story — First thing visitors see */}
      <section className="w-full max-w-2xl mb-16 px-4" aria-labelledby="veteran-founded-heading-top">
        <h2 id="veteran-founded-heading-top" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-6 text-center">
          Founded by a Veteran. Dedicated to Serving Those Who Served.
        </h2>

        {/* Photo placeholder */}
        <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-[var(--bg-surface)] border-2 border-teal-cathedral/20 flex items-center justify-center">
          <svg className="w-12 h-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>

        <div className="text-sm text-[var(--text-muted)] leading-relaxed space-y-4 max-w-xl mx-auto">
          <p className="metallic-gold">
            As a veteran, I understand the responsibility that comes with wearing the uniform
            — and the responsibility that continues after it comes off.
          </p>
          <p className="metallic-gold">
            After serving, I saw how many military families weren&rsquo;t fully informed about
            their life insurance options outside of standard military coverage.
          </p>
          <p className="metallic-gold font-medium text-base">
            This platform was created as a bridge.
          </p>
          <p className="metallic-gold">
            When you request a review, we connect you with trusted, independent, licensed
            insurance professionals who understand the unique needs of military families.
          </p>
          <p className="metallic-gold italic font-medium text-base">
            This is personal.<br />
            Service doesn&rsquo;t end at separation — and neither should protection.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-4 pt-4 border-t border-indigo-cathedral/8">
            We are not affiliated with the U.S. Government or Department of Defense. We connect
            individuals with independent, licensed insurance professionals.
          </p>
        </div>
      </section>

      {/* Hero — Above the Form */}
      <header className="text-center mb-10">
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Protect What Matters Most
        </div>
        <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] mb-4">
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
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-[#E8E8E8] text-black rounded-[13px] shadow-[0_0_34px_rgba(0,168,168,0.12)] p-6 md:p-8 space-y-6" noValidate aria-label="Life insurance quote request form">
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
                <label htmlFor="firstName" className="block text-sm text-gray-700">First Name</label>
                <input id="firstName" type="text" value={form.firstName} onChange={(e) => updateField("firstName", autoCapitalizeName(e.target.value))} placeholder="John" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} className={INPUT_CLASS} />
                {errors.firstName && <p id="firstName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.firstName}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="lastName" className="block text-sm text-gray-700">Last Name</label>
                <input id="lastName" type="text" value={form.lastName} onChange={(e) => updateField("lastName", autoCapitalizeName(e.target.value))} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} className={INPUT_CLASS} />
                {errors.lastName && <p id="lastName-error" className="text-crimson-cathedral text-xs" role="alert">{errors.lastName}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="dateOfBirth" className="block text-sm text-gray-700">Date of Birth</label>
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
              <p id="dob-hint" className="text-gray-500 text-xs">You must be at least 18 years old.</p>
              {errors.dateOfBirth && <p id="dob-error" className="text-crimson-cathedral text-xs" role="alert">{errors.dateOfBirth}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="state" className="block text-sm text-gray-700">State</label>
              <select id="state" value={form.state} onChange={(e) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} aria-describedby={errors.state ? "state-error" : undefined} className={SELECT_CLASS}>
                <option value="">Select your state...</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              {errors.state && <p id="state-error" className="text-crimson-cathedral text-xs" role="alert">{errors.state}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="coverage" className="block text-sm text-gray-700">Coverage Interest</label>
              <select id="coverage" value={form.coverageInterest} onChange={(e) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : undefined} className={SELECT_CLASS}>
                {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.coverageInterest && <p id="coverage-error" className="text-crimson-cathedral text-xs" role="alert">{errors.coverageInterest}</p>}
            </div>

            {/* Veteran Status */}
            <div className="space-y-1">
              <label htmlFor="veteranStatus" className="block text-sm text-gray-700">Veteran Status</label>
              <select id="veteranStatus" value={form.veteranStatus} onChange={(e) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} aria-describedby={errors.veteranStatus ? "veteran-error" : undefined} className={SELECT_CLASS}>
                {VETERAN_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {errors.veteranStatus && <p id="veteran-error" className="text-crimson-cathedral text-xs" role="alert">{errors.veteranStatus}</p>}
            </div>

            {/* Military Branch — conditional subcategory (only shown for veterans) */}
            {form.veteranStatus === "veteran" && (
              <div className="space-y-1 animate-in fade-in">
                <label htmlFor="militaryBranch" className="block text-sm text-gray-700">Branch of Service</label>
                <select id="militaryBranch" value={form.militaryBranch} onChange={(e) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} aria-describedby={errors.militaryBranch ? "branch-error branch-hint" : "branch-hint"} className={SELECT_CLASS}>
                  {MILITARY_BRANCH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p id="branch-hint" className="text-gray-500 text-xs">Thank you for your service.</p>
                {errors.militaryBranch && <p id="branch-error" className="text-crimson-cathedral text-xs" role="alert">{errors.militaryBranch}</p>}
              </div>
            )}

            {/* Next button */}
            <button
              type="button"
              onClick={nextStep}
              className="w-full py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]"
            >
              Continue
            </button>
          </div>
        )}

        {/* --- Step 1: Contact --- */}
        {step === 1 && (
          <div ref={stepContainerRef} className="space-y-5 animate-in fade-in" role="group" aria-label="Step 2: Contact Information">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm text-gray-700">Email Address</label>
              <input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="john.doe@example.com" autoComplete="email" aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={INPUT_CLASS} />
              {errors.email && <p id="email-error" className="text-crimson-cathedral text-xs" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="phone" className="block text-sm text-gray-700">Phone Number</label>
              <input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} className={INPUT_CLASS} />
              {errors.phone && <p id="phone-error" className="text-crimson-cathedral text-xs" role="alert">{errors.phone}</p>}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-gray-500 border border-gray-300 hover:border-gray-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]"
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

            {/* Navigation + Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all text-gray-500 border border-gray-300 hover:border-gray-400"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="flex-1 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
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
        <a href="/privacy#do-not-sell" className="text-xs text-teal-cathedral underline">
          Do Not Sell or Share My Personal Information
        </a>
      </div>

      {/* Section 2: The Gap Most Don't Realize Exists */}
      <section className="w-full max-w-2xl mt-20 px-4 text-center" aria-labelledby="gap-heading">
        <h2 id="gap-heading" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-6">
          Your Service Protects Others. But Is Your Family Fully Protected?
        </h2>
        <div className="text-sm text-[var(--text-muted)] leading-relaxed space-y-4 text-left max-w-xl mx-auto">
          <p>
            Many service members rely solely on SGLI or assume their coverage will always be enough.
          </p>
          <p>
            But coverage limits, conversion timelines, and post-service changes can create unexpected gaps.
          </p>
          <p className="font-medium text-[var(--text-primary)]">Whether you&rsquo;re:</p>
          <ul className="grid grid-cols-2 gap-2 text-[var(--text-primary)] text-sm">
            {["Active Duty", "National Guard", "Reserve", "Transitioning out", "Fully separated"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-cathedral flex-shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p>
            It&rsquo;s important to understand what options exist beyond basic military coverage.
          </p>
          <p className="italic text-[var(--text-primary)]">
            This isn&rsquo;t about replacing anything.<br />
            It&rsquo;s about understanding your full protection picture.
          </p>
        </div>
      </section>

      {/* Section 3: How It Works */}
      <section className="w-full max-w-2xl mt-20 px-4 text-center" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-8">
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

      {/* Section 5: Who This Is For */}
      <section className="w-full max-w-2xl mt-20 px-4 text-center" aria-labelledby="who-heading">
        <h2 id="who-heading" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-3">
          Serving Every Stage of Service.
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-8">This resource is built for:</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            "Active Duty Service Members",
            "National Guard",
            "Reserve Members",
            "Veterans",
            "Military Families",
            "Transitioning Service Members",
          ].map((category) => (
            <div key={category} className="cathedral-surface p-4 text-center">
              <p className="text-sm text-[var(--text-primary)] font-medium">{category}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--text-primary)] mt-6 font-medium">
          If you&rsquo;ve served — this is for you.
        </p>
      </section>

      {/* Section 6: Frequently Asked Questions */}
      <section className="w-full max-w-2xl mt-20 px-4" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6 max-w-xl mx-auto">
          {[
            {
              q: "Is this the same as SGLI?",
              a: "No. This is a review of additional or alternative life insurance options available outside standard military coverage.",
            },
            {
              q: "Is this affiliated with the military?",
              a: "No. This platform is independently operated and not affiliated with the U.S. Government or Department of Defense.",
            },
            {
              q: "Is there an obligation to purchase?",
              a: "No. Requesting a review simply connects you with a licensed professional to explore your options.",
            },
            {
              q: "Are veterans eligible?",
              a: "Yes. Many options are available for veterans, including those who have separated from service.",
            },
          ].map((item) => (
            <div key={item.q} className="border-b border-indigo-cathedral/8 pb-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">{item.q}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 7: Final Call to Action */}
      <section className="w-full max-w-2xl mt-20 px-4 text-center" aria-labelledby="final-cta-heading">
        <h2 id="final-cta-heading" className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-4">
          Your Service Meant Something. So Does Your Family&rsquo;s Security.
        </h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-2">
          You&rsquo;ve protected others.
        </p>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-8">
          Now let&rsquo;s make sure your family is protected too.
        </p>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]"
        >
          Start My Coverage Review
        </button>
        <p className="text-xs text-[var(--text-muted)] mt-3">Takes less than 60 seconds.</p>
      </section>

      {/* Trust Signals — Social Proof & How It Works */}
      <div className="w-full flex justify-center mt-16 px-4">
        <TrustSignals />
      </div>

      {/* Learn More — Links to content pages */}
      <section className="w-full max-w-lg mt-16 px-4" aria-label="Learn more">
        <h2 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wider text-center mb-6">
          Learn More
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <a href="/about" className="cathedral-surface p-4 text-center text-sm text-[var(--text-primary)] font-medium hover:border-teal-cathedral/30 transition-all">
            About Us
          </a>
          <a href="/about#how-it-works" className="cathedral-surface p-4 text-center text-sm text-[var(--text-primary)] font-medium hover:border-teal-cathedral/30 transition-all">
            How It Works
          </a>
          <a href="/faq" className="cathedral-surface p-4 text-center text-sm text-[var(--text-primary)] font-medium hover:border-teal-cathedral/30 transition-all">
            FAQ
          </a>
          <a href="/about#who-we-serve" className="cathedral-surface p-4 text-center text-sm text-[var(--text-primary)] font-medium hover:border-teal-cathedral/30 transition-all">
            Who We Serve
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center flex-wrap">
          <a href="/about" className="text-teal-cathedral/70 hover:text-teal-cathedral">About</a>
          <a href="/faq" className="text-teal-cathedral/70 hover:text-teal-cathedral">FAQ</a>
          <a href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Privacy Policy</a>
          <a href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Terms of Service</a>
        </nav>
        <p>&copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.</p>
      </footer>
    </main>
  );
}
