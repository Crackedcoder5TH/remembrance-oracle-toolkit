/**
 * API Request Validation
 *
 * Zero-dependency validation. Defines typed schemas for API payloads.
 * Returns structured errors so the API can respond with specific field messages.
 *
 * Pattern: validate(body) → { valid: true, data: T } | { valid: false, errors: string[] }
 */

// --- Shared validators ---

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function validateName(name: unknown): string | null {
  if (!isString(name)) return "Name must be a string.";
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters.";
  if (trimmed.length > 100) return "Name must be at most 100 characters.";
  if (!/^[a-zA-Z\s'.,-]+$/.test(trimmed)) return "Name contains invalid characters.";
  return null;
}

function validateEmailField(email: unknown): string | null {
  if (!isString(email)) return "Email must be a string.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email) || email.length > 254) return "Invalid email address.";
  return null;
}

/** Simple email validation check — exported for use in other routes */
export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}

function validatePhone(phone: unknown): string | null {
  if (!isString(phone)) return "Phone must be a string.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) {
    return "Invalid phone number. Must be a 10-digit US number.";
  }
  return null;
}

function validateDob(dob: unknown): string | null {
  if (!isString(dob)) return "Date of birth must be a string.";
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "Invalid date format. Use YYYY-MM-DD.";
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "Invalid date.";
  if (year < 1900 || year > new Date().getFullYear()) return "Invalid year.";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return "Invalid date.";
  }
  const today = new Date();
  const min18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  if (date > min18) return "You must be at least 18 years old.";
  return null;
}

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
]);

const VALID_COVERAGE = new Set(["term", "whole", "universal", "final-expense", "annuity", "not-sure"]);
const VALID_VETERAN_STATUS = new Set(["veteran", "non-veteran"]);
const VALID_MILITARY_BRANCHES = new Set([
  "army", "marine-corps", "navy", "air-force", "space-force",
  "coast-guard", "national-guard", "reserves",
]);

// --- Lead submission schema ---

export interface ValidatedLeadPayload {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  tcpaConsent: true;
  privacyConsent: true;
  consentTimestamp: string;
  consentText: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export type ValidationResult =
  | { valid: true; data: ValidatedLeadPayload }
  | { valid: false; errors: string[] };

/**
 * Validate a lead submission request body.
 * Returns typed validated data on success, or an array of error messages.
 */
export function validateLeadPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be a JSON object."] };
  }

  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  // Name fields
  const firstNameErr = validateName(b.firstName);
  if (firstNameErr) errors.push(`First name: ${firstNameErr}`);

  const lastNameErr = validateName(b.lastName);
  if (lastNameErr) errors.push(`Last name: ${lastNameErr}`);

  // Date of birth
  const dobErr = validateDob(b.dateOfBirth);
  if (dobErr) errors.push(`Date of birth: ${dobErr}`);

  // Email
  const emailErr = validateEmailField(b.email);
  if (emailErr) errors.push(emailErr);

  // Phone
  const phoneErr = validatePhone(b.phone);
  if (phoneErr) errors.push(phoneErr);

  // State
  if (!isString(b.state) || !VALID_STATES.has(b.state)) {
    errors.push("Invalid state.");
  }

  // Coverage interest
  if (!isString(b.coverageInterest) || !VALID_COVERAGE.has(b.coverageInterest)) {
    errors.push("Invalid coverage interest.");
  }

  // Veteran status
  if (!isString(b.veteranStatus) || !VALID_VETERAN_STATUS.has(b.veteranStatus)) {
    errors.push("Invalid veteran status.");
  }

  // Military branch (required only for veterans)
  if (b.veteranStatus === "veteran") {
    if (!isString(b.militaryBranch) || !VALID_MILITARY_BRANCHES.has(b.militaryBranch)) {
      errors.push("Military branch is required for veterans.");
    }
  }

  // Consent
  if (b.tcpaConsent !== true) errors.push("TCPA consent is required.");
  if (b.privacyConsent !== true) errors.push("Privacy policy consent is required.");
  if (!isString(b.consentTimestamp) || !b.consentTimestamp) errors.push("Consent timestamp is required.");
  if (!isString(b.consentText) || !b.consentText) errors.push("Consent text is required.");

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      firstName: (b.firstName as string).trim(),
      lastName: (b.lastName as string).trim(),
      dateOfBirth: b.dateOfBirth as string,
      email: (b.email as string).trim().toLowerCase(),
      phone: (b.phone as string).replace(/\D/g, "").slice(-10),
      state: b.state as string,
      coverageInterest: b.coverageInterest as string,
      veteranStatus: b.veteranStatus as string,
      militaryBranch: b.veteranStatus === "veteran" ? (b.militaryBranch as string) : "",
      tcpaConsent: true,
      privacyConsent: true,
      consentTimestamp: b.consentTimestamp as string,
      consentText: b.consentText as string,
      // Optional UTM fields
      ...(isString(b.utmSource) && b.utmSource ? { utmSource: b.utmSource } : {}),
      ...(isString(b.utmMedium) && b.utmMedium ? { utmMedium: b.utmMedium } : {}),
      ...(isString(b.utmCampaign) && b.utmCampaign ? { utmCampaign: b.utmCampaign } : {}),
      ...(isString(b.utmTerm) && b.utmTerm ? { utmTerm: b.utmTerm } : {}),
      ...(isString(b.utmContent) && b.utmContent ? { utmContent: b.utmContent } : {}),
    },
  };
}
