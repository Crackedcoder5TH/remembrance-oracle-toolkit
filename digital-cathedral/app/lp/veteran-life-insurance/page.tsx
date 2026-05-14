"use client";

/**
 * Landing Page — Veteran Life Insurance
 *
 * Optimized for paid traffic (Google Ads, Facebook Ads).
 * Stripped-down, single-screen, 3-field form. No navigation distractions.
 *
 * Hidden fields: coverageInterest="income-replacement", veteranStatus="veteran"
 * UTM params auto-captured from URL query string.
 */

import { useState, useCallback, useRef, FormEvent } from "react";
import { useUtmTracking } from "@/app/protect/hooks/use-utm-tracking";
import { trackConversion } from "@/app/lib/analytics";

// ─── Constants ───

const TCPA_CONSENT_TEXT =
  "By checking this box, I agree that Valor Legacies may contact me at the phone number I provided above, including by autodialed or prerecorded calls and text messages, for marketing purposes. I understand this consent is not required to obtain any product or service. Message and data rates may apply. I have read and agree to the Privacy Policy and Terms of Service.";

const INPUT_CLASS =
  "w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--indigo-light)] rounded-lg px-4 py-3.5 text-sm focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)]/30 transition-all";

const TRUST_SIGNALS = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    label: "Founded by a Veteran",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
      </svg>
    ),
    label: "Licensed Professionals",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "No Obligation",
  },
];

// ─── Validation Helpers (shared from lib/validation.ts) ───

import {
  isValidName as validateName,
  isValidEmail as validateEmail,
  isValidPhone as validatePhone,
  formatPhoneInput,
  autoCapitalizeName,
  sanitizeInput as sanitize,
} from "@/app/lib/validation";

// ─── Types ───

interface LpFormData {
  fullName: string;
  phone: string;
  email: string;
  tcpaConsent: boolean;
  _hp_website: string;
}

interface LpFormErrors {
  fullName?: string;
  phone?: string;
  email?: string;
  tcpaConsent?: string;
}

// ─── Metadata (exported for Next.js) ───
// Note: metadata is exported from a separate file or the layout.
// For "use client" pages, we set the title via <title> in <head> below.

// ─── Component ───

export default function VeteranLifeInsuranceLandingPage() {
  const utm = useUtmTracking();
  const pageLoadTime = useRef(Date.now());
  const lastSubmitRef = useRef(0);

  const [form, setForm] = useState<LpFormData>({
    fullName: "",
    phone: "",
    email: "",
    tcpaConsent: false,
    _hp_website: "",
  });
  const [errors, setErrors] = useState<LpFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [serverError, setServerError] = useState("");

  // Title now set via server-side metadata in layout.tsx

  const updateField = useCallback((field: keyof LpFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field as keyof LpFormErrors];
      return next;
    });
    setServerError("");
  }, []);

  function validate(): LpFormErrors {
    const errs: LpFormErrors = {};
    // Split fullName into first + last for validation
    const nameParts = form.fullName.trim().split(/\s+/);
    if (nameParts.length < 2 || !validateName(nameParts[0]) || !validateName(nameParts.slice(1).join(" "))) {
      errs.fullName = "Please enter your full name (first and last).";
    }
    if (!validatePhone(form.phone)) errs.phone = "Please enter a valid 10-digit US phone number.";
    if (!validateEmail(sanitize(form.email))) errs.email = "Please enter a valid email address.";
    if (!form.tcpaConsent) errs.tcpaConsent = "Consent is required to be contacted.";
    return errs;
  }

  async function submitLead() {
    setLoading(true);
    setServerError("");
    try {
      // Split full name
      const nameParts = form.fullName.trim().split(/\s+/);
      const firstName = sanitize(nameParts[0]);
      const lastName = sanitize(nameParts.slice(1).join(" "));

      // Fetch CSRF token
      const csrfRes = await fetch("/api/csrf");
      const csrfData = csrfRes.ok ? await csrfRes.json() : { token: "" };

      // Build UTM params, filtering nulls
      const utmPayload: Record<string, string> = {};
      for (const [key, value] of Object.entries(utm)) {
        if (value !== null) utmPayload[key] = value;
      }

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfData.token,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          dateOfBirth: "",
          email: sanitize(form.email),
          phone: form.phone.replace(/\D/g, ""),
          state: "",
          coverageInterest: "income-replacement",
          veteranStatus: "veteran",
          militaryBranch: "",
          tcpaConsent: form.tcpaConsent,
          privacyConsent: form.tcpaConsent,
          consentTimestamp: new Date().toISOString(),
          consentText: TCPA_CONSENT_TEXT,
          _hp_website: form._hp_website,
          _hp_ts: pageLoadTime.current,
          landingPage: "veteran-life-insurance",
          ...utmPayload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Request failed (${res.status})`);
      }

      const result = await res.json();
      setSubmitted(true);
      setLeadId(result.leadId || "");

      // Fire conversion tracking
      trackConversion(result.leadId || "", "term", "");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Throttle guard
    const now = Date.now();
    if (now - lastSubmitRef.current < 3000) return;
    lastSubmitRef.current = now;

    submitLead();
  }

  // ─── Success State ───
  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--teal)]/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-[var(--teal)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="bg-[var(--bg-surface)] rounded-2xl p-8 border border-[var(--indigo-light)]">
            <p className="text-[var(--teal)] text-sm tracking-[0.3em] uppercase mb-3">Request Received</p>
            <h1 className="text-2xl font-light text-[var(--text-primary)] mb-3">Thank You</h1>
            <p className="text-[var(--text-muted)] text-sm leading-relaxed mb-6">
              A licensed insurance professional will review your information and reach out within 1 business day.
              No obligation — just clear options for your family.
            </p>
            {leadId && (
              <div className="bg-[var(--bg-deep)] rounded-lg px-4 py-3 mb-6 inline-block">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Reference</p>
                <p className="text-sm font-mono text-[var(--text-primary)] select-all">{leadId}</p>
              </div>
            )}
            <div className="pt-4 border-t border-[var(--indigo-light)]">
              <a href="/" className="text-[var(--teal)] text-sm hover:underline">
                Visit Valor Legacies
              </a>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-8">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </div>
      </main>
    );
  }

  // ─── Landing Page ───
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-[var(--teal)] text-xs tracking-[0.3em] uppercase mb-4">
            Veteran-Exclusive Coverage Options
          </p>
          <h1 className="text-3xl md:text-4xl font-light text-[var(--text-primary)] mb-4 leading-tight">
            Protect Your Family&rsquo;s Future
          </h1>
          <p className="text-[var(--text-muted)] text-base md:text-lg leading-relaxed max-w-md mx-auto">
            Veteran-exclusive life insurance options &mdash; get a free quote in 60 seconds
          </p>
        </div>

        {/* Trust Signals */}
        <div className="flex justify-center gap-6 md:gap-8 mb-10">
          {TRUST_SIGNALS.map((signal) => (
            <div key={signal.label} className="flex flex-col items-center gap-2 text-center">
              <div className="text-[var(--teal)]">{signal.icon}</div>
              <span className="text-xs text-[var(--text-muted)] leading-tight max-w-[100px]">{signal.label}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--indigo-light)] p-6 md:p-8 space-y-5"
          noValidate
          aria-label="Veteran life insurance quote request"
        >
          {/* Honeypot */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
            <label htmlFor="_hp_website_vlp">Website</label>
            <input
              id="_hp_website_vlp"
              name="website"
              type="text"
              value={form._hp_website}
              onChange={(e) => updateField("_hp_website", e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* Hidden fields */}
          <input type="hidden" name="coverageInterest" value="income-replacement" />
          <input type="hidden" name="veteranStatus" value="veteran" />

          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="block text-sm font-medium text-[var(--text-primary)]">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={form.fullName}
              onChange={(e) => updateField("fullName", autoCapitalizeName(e.target.value))}
              placeholder="John Doe"
              autoComplete="name"
              aria-required="true"
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              className={INPUT_CLASS}
            />
            {errors.fullName && <p id="fullName-error" className="text-[var(--crimson)] text-xs" role="alert">{errors.fullName}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-primary)]">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", formatPhoneInput(e.target.value))}
              placeholder="(555) 123-4567"
              autoComplete="tel"
              aria-required="true"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className={INPUT_CLASS}
            />
            {errors.phone && <p id="phone-error" className="text-[var(--crimson)] text-xs" role="alert">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)]">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="john.doe@example.com"
              autoComplete="email"
              aria-required="true"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={INPUT_CLASS}
            />
            {errors.email && <p id="email-error" className="text-[var(--crimson)] text-xs" role="alert">{errors.email}</p>}
          </div>

          {/* TCPA Consent */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <input
                id="tcpaConsent"
                type="checkbox"
                checked={form.tcpaConsent}
                onChange={(e) => updateField("tcpaConsent", e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--indigo-light)] bg-[var(--bg-deep)] text-[var(--teal)] focus:ring-[var(--teal)]/50 shrink-0"
              />
              <label htmlFor="tcpaConsent" className="text-xs text-[var(--text-muted)] leading-relaxed">
                By checking this box, I agree that <strong className="text-[var(--text-primary)]">Valor Legacies</strong> may
                contact me at the phone number I provided above, including by autodialed or prerecorded calls
                and text messages, for marketing purposes. I understand this consent is <strong className="text-[var(--text-primary)]">not
                required</strong> to obtain any product or service. Message and data rates may apply. I have read
                and agree to the{" "}
                <a href="/privacy" className="text-[var(--teal)] underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and{" "}
                <a href="/terms" className="text-[var(--teal)] underline" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
              </label>
            </div>
            {errors.tcpaConsent && <p className="text-[var(--crimson)] text-xs ml-7" role="alert">{errors.tcpaConsent}</p>}
          </div>

          {/* Server Error */}
          {serverError && (
            <div className="text-[var(--crimson)] text-sm text-center py-2" role="alert" aria-live="assertive">{serverError}</div>
          )}

          {/* CTA Button */}
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full py-4 rounded-lg font-semibold text-base transition-all bg-[var(--teal)] text-white hover:bg-[var(--teal)]/90 hover:shadow-[0_0_40px_rgba(0,168,168,0.25)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Get My Free Quote"}
          </button>

          <p className="text-center text-xs text-[var(--text-muted)]">
            Takes less than 60 seconds. No obligation.
          </p>
        </form>

        {/* Disclaimers */}
        <div className="mt-8 space-y-3 text-xs text-[var(--text-muted)] leading-relaxed text-center">
          <p>
            This website is not affiliated with the U.S. Government or Department of Defense.
            We connect individuals with independent, licensed insurance professionals.
          </p>
          <p>
            This website is operated by Valor Legacies and is not an insurance company. We do not provide
            insurance quotes, bind coverage, or offer insurance advice. Coverage availability, rates,
            and terms vary by state. Not all applicants will qualify.
          </p>
          <div className="pt-4">
            <a href="/privacy#do-not-sell" className="text-[var(--teal)] underline text-xs">
              Do Not Sell or Share My Personal Information
            </a>
          </div>
          <p className="pt-2">&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
