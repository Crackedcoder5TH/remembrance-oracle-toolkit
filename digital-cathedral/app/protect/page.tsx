"use client";

import { useState, FormEvent } from "react";

/**
 * Oracle-pulled patterns used:
 *  - validate-email (EVOLVE 0.661) → validateEmail + validatePhone
 *  - throttle (EVOLVE 0.704) → form submission rate limiting
 *  - deep-clone (PULL 0.748) → form state management
 *  - pipe (PULL 0.728) → data transformation
 *
 * Kingdom perspective: The lead form is a "protection covenant" —
 * the seeker declares their intention to protect their legacy,
 * and the kingdom connects them with a licensed guardian.
 */

// --- Oracle-pulled: pipe (coherency 0.970, PULL) ---
function pipe<T>(...fns: Array<(val: T) => T>): (input: T) => T {
  return (input: T) => fns.reduce((val, fn) => fn(val), input);
}

// --- Oracle-pulled: throttle (coherency 0.970, EVOLVE) ---
function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): T {
  let lastCall = 0;
  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn.apply(this, args);
    }
  } as T;
}

// --- Oracle-evolved: validate-email → full form validation ---
function validateEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}

function validatePhone(phone: string): boolean {
  if (typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function validateName(name: string): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z\s'.,-]+$/.test(trimmed);
}

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
  { value: "not-sure", label: "Not sure — I need guidance" },
];

const TCPA_CONSENT_TEXT =
  "By checking this box, I agree that [Company Name] may contact me at the phone number I provided above, including by autodialed or prerecorded calls and text messages, for marketing purposes. I understand this consent is not required to obtain any product or service. Message and data rates may apply. I have read and agree to the Privacy Policy and Terms of Service.";

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  tcpaConsent: boolean;
  privacyConsent: boolean;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  coverageInterest?: string;
  tcpaConsent?: string;
  privacyConsent?: string;
}

// Oracle pipe pattern: chain validators for clean validation flow
const sanitizeInput = pipe(
  (s: string) => s.trim(),
  (s: string) => s.replace(/[<>]/g, ""),
);

export default function ProtectPage() {
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    state: "",
    coverageInterest: "",
    tcpaConsent: false,
    privacyConsent: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [whisper, setWhisper] = useState("");
  const [serverError, setServerError] = useState("");

  function updateField(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!validateName(sanitizeInput(form.firstName))) errs.firstName = "Please enter a valid first name.";
    if (!validateName(sanitizeInput(form.lastName))) errs.lastName = "Please enter a valid last name.";
    if (!validateEmail(sanitizeInput(form.email))) errs.email = "Please enter a valid email address.";
    if (!validatePhone(form.phone)) errs.phone = "Please enter a valid 10-digit US phone number.";
    if (!form.state) errs.state = "Please select your state.";
    if (!form.coverageInterest) errs.coverageInterest = "Please select a coverage interest.";
    if (!form.tcpaConsent) errs.tcpaConsent = "Consent is required to be contacted.";
    if (!form.privacyConsent) errs.privacyConsent = "You must agree to the Privacy Policy and Terms.";
    return errs;
  }

  // Oracle throttle pattern: prevent double-submissions
  const throttledSubmit = throttle(async (data: FormData) => {
    setLoading(true);
    setServerError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: sanitizeInput(data.firstName),
          lastName: sanitizeInput(data.lastName),
          email: sanitizeInput(data.email),
          phone: data.phone.replace(/\D/g, ""),
          state: data.state,
          coverageInterest: data.coverageInterest,
          tcpaConsent: data.tcpaConsent,
          privacyConsent: data.privacyConsent,
          consentTimestamp: new Date().toISOString(),
          consentText: TCPA_CONSENT_TEXT,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Request failed (${res.status})`);
      }
      const result = await res.json();
      setSubmitted(true);
      setWhisper(result.whisper || "Your intention has been received. A guardian will reach out.");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, 3000);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    throttledSubmit(form);
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg cathedral-surface p-8 cathedral-glow text-center">
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

      {/* Important Disclaimers — above form */}
      <div className="w-full max-w-lg mb-6 text-xs text-[var(--text-muted)] text-center leading-relaxed">
        <p>
          This website is not an insurance company and does not provide insurance quotes,
          bind coverage, or offer insurance advice. We connect consumers with licensed
          insurance professionals. All coverage is subject to underwriting approval.
        </p>
      </div>

      {/* Lead Capture Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg cathedral-surface p-6 md:p-8 space-y-5" noValidate>
        {/* Name Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="firstName" className="block text-sm text-[var(--text-muted)]">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              placeholder="John"
              autoComplete="given-name"
              className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all"
            />
            {errors.firstName && <p className="text-crimson-cathedral text-xs">{errors.firstName}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="lastName" className="block text-sm text-[var(--text-muted)]">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              placeholder="Doe"
              autoComplete="family-name"
              className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all"
            />
            {errors.lastName && <p className="text-crimson-cathedral text-xs">{errors.lastName}</p>}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm text-[var(--text-muted)]">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="john.doe@example.com"
            autoComplete="email"
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all"
          />
          {errors.email && <p className="text-crimson-cathedral text-xs">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1">
          <label htmlFor="phone" className="block text-sm text-[var(--text-muted)]">
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="(555) 123-4567"
            autoComplete="tel"
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all"
          />
          {errors.phone && <p className="text-crimson-cathedral text-xs">{errors.phone}</p>}
        </div>

        {/* State */}
        <div className="space-y-1">
          <label htmlFor="state" className="block text-sm text-[var(--text-muted)]">
            State
          </label>
          <select
            id="state"
            value={form.state}
            onChange={(e) => updateField("state", e.target.value)}
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all appearance-none"
          >
            <option value="">Select your state...</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          {errors.state && <p className="text-crimson-cathedral text-xs">{errors.state}</p>}
        </div>

        {/* Coverage Interest */}
        <div className="space-y-1">
          <label htmlFor="coverage" className="block text-sm text-[var(--text-muted)]">
            Coverage Interest
          </label>
          <select
            id="coverage"
            value={form.coverageInterest}
            onChange={(e) => updateField("coverageInterest", e.target.value)}
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all appearance-none"
          >
            {COVERAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {errors.coverageInterest && <p className="text-crimson-cathedral text-xs">{errors.coverageInterest}</p>}
        </div>

        {/* Divider */}
        <div className="border-t border-teal-cathedral/10 pt-5" />

        {/* TCPA Consent — FCC 2025 One-to-One Compliance */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              id="tcpaConsent"
              type="checkbox"
              checked={form.tcpaConsent}
              onChange={(e) => updateField("tcpaConsent", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-teal-cathedral/30 bg-[var(--bg-deep)] text-teal-cathedral focus:ring-teal-cathedral/50 shrink-0"
            />
            <label htmlFor="tcpaConsent" className="text-xs text-[var(--text-muted)] leading-relaxed">
              By checking this box, I agree that <strong className="text-[var(--text-primary)]">[Company Name]</strong> may
              contact me at the phone number I provided above, including by autodialed or prerecorded calls
              and text messages, for marketing purposes. I understand this consent is <strong className="text-[var(--text-primary)]">not
              required</strong> to obtain any product or service. Message and data rates may apply. I have read
              and agree to the{" "}
              <a href="/privacy" className="text-teal-cathedral underline">Privacy Policy</a> and{" "}
              <a href="/terms" className="text-teal-cathedral underline">Terms of Service</a>.
            </label>
          </div>
          {errors.tcpaConsent && <p className="text-crimson-cathedral text-xs ml-7">{errors.tcpaConsent}</p>}
        </div>

        {/* Privacy / Terms Consent */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              id="privacyConsent"
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(e) => updateField("privacyConsent", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-teal-cathedral/30 bg-[var(--bg-deep)] text-teal-cathedral focus:ring-teal-cathedral/50 shrink-0"
            />
            <label htmlFor="privacyConsent" className="text-xs text-[var(--text-muted)] leading-relaxed">
              I acknowledge that my information will be shared with licensed insurance professionals
              who may contact me about life insurance options. I understand I can opt out at any time.
              See our <a href="/privacy" className="text-teal-cathedral underline">Privacy Policy</a> for
              details on how we handle your data, including your right to opt out of the sale
              or sharing of your personal information.
            </label>
          </div>
          {errors.privacyConsent && <p className="text-crimson-cathedral text-xs ml-7">{errors.privacyConsent}</p>}
        </div>

        {/* Server Error */}
        {serverError && (
          <div className="text-crimson-cathedral text-sm text-center py-2">
            {serverError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg font-medium text-sm transition-all
            bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30
            hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Protect My Legacy"}
        </button>
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
