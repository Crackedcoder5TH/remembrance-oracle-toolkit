/**
 * useLeadForm — React hook for lead capture form logic.
 * Oracle: GENERATE (0.370) — no existing pattern, write new
 *
 * Encapsulates: form state, validation, throttled submission, error handling.
 * Uses oracle-pulled patterns: pipe (PULL 0.728), throttle (EVOLVE 0.704),
 * validate-email (EVOLVE 0.661).
 */
import { useState, FormEvent, useCallback, useRef } from "react";

// --- Oracle-pulled: pipe (coherency 0.970, PULL) ---
function pipe<T>(...fns: Array<(val: T) => T>): (input: T) => T {
  return (input: T) => fns.reduce((val, fn) => fn(val), input);
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

// Oracle pipe pattern: chain sanitizers
const sanitizeInput = pipe(
  (s: string) => s.trim(),
  (s: string) => s.replace(/[<>]/g, ""),
);

export const TCPA_CONSENT_TEXT =
  "By checking this box, I agree that [Company Name] may contact me at the phone number I provided above, including by autodialed or prerecorded calls and text messages, for marketing purposes. I understand this consent is not required to obtain any product or service. Message and data rates may apply. I have read and agree to the Privacy Policy and Terms of Service.";

export interface LeadFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  tcpaConsent: boolean;
  privacyConsent: boolean;
}

export interface LeadFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  coverageInterest?: string;
  tcpaConsent?: string;
  privacyConsent?: string;
}

export interface UseLeadFormReturn {
  form: LeadFormData;
  errors: LeadFormErrors;
  loading: boolean;
  submitted: boolean;
  whisper: string;
  serverError: string;
  updateField: (field: keyof LeadFormData, value: string | boolean) => void;
  handleSubmit: (e: FormEvent) => void;
}

export function useLeadForm(): UseLeadFormReturn {
  const [form, setForm] = useState<LeadFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    state: "",
    coverageInterest: "",
    tcpaConsent: false,
    privacyConsent: false,
  });
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [whisper, setWhisper] = useState("");
  const [serverError, setServerError] = useState("");

  // Oracle throttle pattern: prevent double-submissions (ref-based for stability)
  const lastSubmitRef = useRef(0);
  const THROTTLE_MS = 3000;

  const updateField = useCallback((field: keyof LeadFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field as keyof LeadFormErrors]) {
        const next = { ...prev };
        delete next[field as keyof LeadFormErrors];
        return next;
      }
      return prev;
    });
  }, []);

  function validate(): LeadFormErrors {
    const errs: LeadFormErrors = {};
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

  async function submitLead(data: LeadFormData) {
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
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Throttle guard
    const now = Date.now();
    if (now - lastSubmitRef.current < THROTTLE_MS) return;
    lastSubmitRef.current = now;

    submitLead(form);
  }

  return { form, errors, loading, submitted, whisper, serverError, updateField, handleSubmit };
}
