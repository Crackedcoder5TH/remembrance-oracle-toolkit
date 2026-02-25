/**
 * useLeadForm — React hook for multi-step lead capture form.
 * Oracle: GENERATE (0.370) — no existing pattern, write new
 *
 * Encapsulates: multi-step state, per-step validation, throttled submission, error handling.
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

// --- Oracle GENERATE: date of birth with 18+ age gate ---
function validateDob(dob: string): boolean {
  if (typeof dob !== "string") return false;
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const today = new Date();
  const min18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  return date <= min18;
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
  dateOfBirth: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  tcpaConsent: boolean;
  privacyConsent: boolean;
}

export interface LeadFormErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  state?: string;
  coverageInterest?: string;
  veteranStatus?: string;
  militaryBranch?: string;
  tcpaConsent?: string;
  privacyConsent?: string;
}

export const TOTAL_STEPS = 3;

export interface UseLeadFormReturn {
  form: LeadFormData;
  errors: LeadFormErrors;
  loading: boolean;
  submitted: boolean;
  whisper: string;
  serverError: string;
  step: number;
  totalSteps: number;
  updateField: (field: keyof LeadFormData, value: string | boolean) => void;
  handleSubmit: (e: FormEvent) => void;
  nextStep: () => boolean;
  prevStep: () => void;
  goToStep: (step: number) => void;
}

/**
 * Step 0: Identity   — firstName, lastName, dateOfBirth, state, coverageInterest
 * Step 1: Contact    — email, phone
 * Step 2: Consent    — tcpaConsent, privacyConsent → submit
 */
function validateStep(step: number, form: LeadFormData): LeadFormErrors {
  const errs: LeadFormErrors = {};

  if (step === 0) {
    if (!validateName(sanitizeInput(form.firstName))) errs.firstName = "Please enter a valid first name.";
    if (!validateName(sanitizeInput(form.lastName))) errs.lastName = "Please enter a valid last name.";
    if (!form.dateOfBirth) {
      errs.dateOfBirth = "Please enter your date of birth.";
    } else if (!validateDob(form.dateOfBirth)) {
      errs.dateOfBirth = "You must be at least 18 years old to submit this form.";
    }
    if (!form.state) errs.state = "Please select your state.";
    if (!form.coverageInterest) errs.coverageInterest = "Please select a coverage interest.";
    if (!form.veteranStatus) errs.veteranStatus = "Please select your veteran status.";
    if (form.veteranStatus === "veteran" && !form.militaryBranch) {
      errs.militaryBranch = "Please select your branch of service.";
    }
  }

  if (step === 1) {
    if (!validateEmail(sanitizeInput(form.email))) errs.email = "Please enter a valid email address.";
    if (!validatePhone(form.phone)) errs.phone = "Please enter a valid 10-digit US phone number.";
  }

  if (step === 2) {
    if (!form.tcpaConsent) errs.tcpaConsent = "Consent is required to be contacted.";
    if (!form.privacyConsent) errs.privacyConsent = "You must agree to the Privacy Policy and Terms.";
  }

  return errs;
}

export function useLeadForm(utmParams?: Record<string, string | null>): UseLeadFormReturn {
  const [form, setForm] = useState<LeadFormData>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    state: "",
    coverageInterest: "",
    veteranStatus: "",
    militaryBranch: "",
    tcpaConsent: false,
    privacyConsent: false,
  });
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [whisper, setWhisper] = useState("");
  const [serverError, setServerError] = useState("");
  const [step, setStep] = useState(0);

  // Oracle throttle pattern: prevent double-submissions (ref-based for stability)
  const lastSubmitRef = useRef(0);
  const THROTTLE_MS = 3000;

  const updateField = useCallback((field: keyof LeadFormData, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Clear military branch when veteran status changes away from "veteran"
      if (field === "veteranStatus" && value !== "veteran") {
        next.militaryBranch = "";
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      if (next[field as keyof LeadFormErrors]) {
        delete next[field as keyof LeadFormErrors];
      }
      // Clear military branch error when veteran status changes
      if (field === "veteranStatus" && next.militaryBranch) {
        delete next.militaryBranch;
      }
      return next;
    });
    setServerError("");
  }, []);

  // Validate current step and advance if valid. Returns true if step was valid.
  const nextStep = useCallback((): boolean => {
    const errs = validateStep(step, form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return false;
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
    return true;
  }, [step, form]);

  const prevStep = useCallback(() => {
    setErrors({});
    setServerError("");
    setStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((target: number) => {
    // Only allow going back, not skipping forward
    if (target < step) {
      setErrors({});
      setServerError("");
      setStep(target);
    }
  }, [step]);

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
          dateOfBirth: data.dateOfBirth,
          email: sanitizeInput(data.email),
          phone: data.phone.replace(/\D/g, ""),
          state: data.state,
          coverageInterest: data.coverageInterest,
          veteranStatus: data.veteranStatus,
          militaryBranch: data.veteranStatus === "veteran" ? data.militaryBranch : "",
          tcpaConsent: data.tcpaConsent,
          privacyConsent: data.privacyConsent,
          consentTimestamp: new Date().toISOString(),
          consentText: TCPA_CONSENT_TEXT,
          // UTM tracking — persisted from session
          ...(utmParams ? filterNullValues(utmParams) : {}),
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

    // Validate final step
    const errs = validateStep(step, form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Throttle guard
    const now = Date.now();
    if (now - lastSubmitRef.current < THROTTLE_MS) return;
    lastSubmitRef.current = now;

    submitLead(form);
  }

  return {
    form, errors, loading, submitted, whisper, serverError,
    step, totalSteps: TOTAL_STEPS,
    updateField, handleSubmit, nextStep, prevStep, goToStep,
  };
}

/** Strip null values from UTM params for API submission */
function filterNullValues(obj: Record<string, string | null>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) result[key] = value;
  }
  return result;
}
