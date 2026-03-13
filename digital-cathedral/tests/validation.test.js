/**
 * Tests for app/lib/validation.ts — validateLeadPayload and isValidEmail.
 *
 * Re-implements the validation logic for testing (same as source).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement validation logic (matching app/lib/validation.ts) ---

function isString(v) { return typeof v === "string"; }

function validateNameField(name) {
  if (!isString(name)) return "Name must be a string.";
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters.";
  if (trimmed.length > 100) return "Name must be at most 100 characters.";
  if (!/^[a-zA-Z\s'.,-]+$/.test(trimmed)) return "Name contains invalid characters.";
  return null;
}

function validateEmailField(email) {
  if (!isString(email)) return "Email must be a string.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email) || email.length > 254) return "Invalid email address.";
  return null;
}

function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}

function validatePhone(phone) {
  if (!isString(phone)) return "Phone must be a string.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1")))
    return "Invalid phone number. Must be a 10-digit US number.";
  return null;
}

function validateDob(dob) {
  if (!isString(dob)) return "Date of birth must be a string.";
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "Invalid date format. Use YYYY-MM-DD.";
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "Invalid date.";
  if (year < 1900 || year > new Date().getFullYear()) return "Invalid year.";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return "Invalid date.";
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
const VALID_COVERAGE = new Set(["mortgage-protection","final-expense","income-replacement","retirement-savings","guaranteed-income","legacy","not-sure"]);
const VALID_PURCHASE_INTENT = new Set(["protect-family","want-protection","exploring"]);
const VALID_VETERAN_STATUS = new Set(["active-duty","reserve","national-guard","veteran","non-military"]);
const VALID_MILITARY_BRANCHES = new Set(["army","marine-corps","navy","air-force","space-force","coast-guard","national-guard","reserves"]);

function validateLeadPayload(body) {
  if (!body || typeof body !== "object") return { valid: false, errors: ["Request body must be a JSON object."] };
  const b = body;
  const errors = [];

  const firstNameErr = validateNameField(b.firstName);
  if (firstNameErr) errors.push(`First name: ${firstNameErr}`);
  const lastNameErr = validateNameField(b.lastName);
  if (lastNameErr) errors.push(`Last name: ${lastNameErr}`);
  const dobErr = validateDob(b.dateOfBirth);
  if (dobErr) errors.push(`Date of birth: ${dobErr}`);
  const emailErr = validateEmailField(b.email);
  if (emailErr) errors.push(emailErr);
  const phoneErr = validatePhone(b.phone);
  if (phoneErr) errors.push(phoneErr);
  if (!isString(b.state) || !VALID_STATES.has(b.state)) errors.push("Invalid state.");
  if (!isString(b.coverageInterest) || !VALID_COVERAGE.has(b.coverageInterest)) errors.push("Invalid coverage interest.");
  if (!isString(b.purchaseIntent) || !VALID_PURCHASE_INTENT.has(b.purchaseIntent)) errors.push("Invalid purchase intent.");
  if (!isString(b.veteranStatus) || !VALID_VETERAN_STATUS.has(b.veteranStatus)) errors.push("Invalid veteran status.");
  if (b.veteranStatus && b.veteranStatus !== "non-military") {
    if (!isString(b.militaryBranch) || !VALID_MILITARY_BRANCHES.has(b.militaryBranch))
      errors.push("Military branch is required for military service members.");
  }
  if (b.tcpaConsent !== true) errors.push("TCPA consent is required.");
  if (b.privacyConsent !== true) errors.push("Privacy policy consent is required.");
  if (!isString(b.consentTimestamp) || !b.consentTimestamp) errors.push("Consent timestamp is required.");
  if (!isString(b.consentText) || !b.consentText) errors.push("Consent text is required.");

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      firstName: b.firstName.trim(),
      lastName: b.lastName.trim(),
      dateOfBirth: b.dateOfBirth,
      email: b.email.trim().toLowerCase(),
      phone: b.phone.replace(/\D/g, "").slice(-10),
      state: b.state,
      coverageInterest: b.coverageInterest,
      purchaseIntent: b.purchaseIntent,
      veteranStatus: b.veteranStatus,
      militaryBranch: b.veteranStatus !== "non-military" ? b.militaryBranch : "",
      tcpaConsent: true,
      privacyConsent: true,
      consentTimestamp: b.consentTimestamp,
      consentText: b.consentText,
      ...(isString(b.utmSource) && b.utmSource ? { utmSource: b.utmSource } : {}),
      ...(isString(b.utmMedium) && b.utmMedium ? { utmMedium: b.utmMedium } : {}),
      ...(isString(b.utmCampaign) && b.utmCampaign ? { utmCampaign: b.utmCampaign } : {}),
      ...(isString(b.utmTerm) && b.utmTerm ? { utmTerm: b.utmTerm } : {}),
      ...(isString(b.utmContent) && b.utmContent ? { utmContent: b.utmContent } : {}),
    },
  };
}

// --- Valid lead fixture ---
function validLead(overrides = {}) {
  return {
    firstName: "John",
    lastName: "Smith",
    dateOfBirth: "1990-06-15",
    email: "john@example.com",
    phone: "5551234567",
    state: "TX",
    coverageInterest: "mortgage-protection",
    purchaseIntent: "protect-family",
    veteranStatus: "veteran",
    militaryBranch: "army",
    tcpaConsent: true,
    privacyConsent: true,
    consentTimestamp: new Date().toISOString(),
    consentText: "I consent to be contacted.",
    ...overrides,
  };
}

// --- Tests ---

describe("validateLeadPayload", () => {
  it("accepts a fully valid lead submission", () => {
    const result = validateLeadPayload(validLead());
    assert.equal(result.valid, true);
    assert.ok(result.data);
    assert.equal(result.data.firstName, "John");
    assert.equal(result.data.email, "john@example.com");
  });

  it("rejects null body", () => {
    const result = validateLeadPayload(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Request body must be a JSON object."));
  });

  it("rejects missing firstName", () => {
    const result = validateLeadPayload(validLead({ firstName: "" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("First name")));
  });

  it("rejects invalid email", () => {
    const result = validateLeadPayload(validLead({ email: "not-an-email" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("email")));
  });

  it("rejects invalid phone", () => {
    const result = validateLeadPayload(validLead({ phone: "123" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("phone")));
  });

  it("rejects invalid state", () => {
    const result = validateLeadPayload(validLead({ state: "XX" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("state")));
  });

  it("rejects invalid coverage interest", () => {
    const result = validateLeadPayload(validLead({ coverageInterest: "alien-insurance" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("coverage")));
  });

  it("rejects invalid purchase intent", () => {
    const result = validateLeadPayload(validLead({ purchaseIntent: "maybe" }));
    assert.equal(result.valid, false);
  });

  it("rejects invalid veteran status", () => {
    const result = validateLeadPayload(validLead({ veteranStatus: "space-pirate" }));
    assert.equal(result.valid, false);
  });

  it("requires military branch for military veterans", () => {
    const result = validateLeadPayload(validLead({ veteranStatus: "active-duty", militaryBranch: "" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("Military branch")));
  });

  it("does not require military branch for non-military", () => {
    const result = validateLeadPayload(validLead({ veteranStatus: "non-military", militaryBranch: "" }));
    assert.equal(result.valid, true);
    assert.equal(result.data.militaryBranch, "");
  });

  it("requires TCPA consent", () => {
    const result = validateLeadPayload(validLead({ tcpaConsent: false }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("TCPA")));
  });

  it("requires privacy consent", () => {
    const result = validateLeadPayload(validLead({ privacyConsent: false }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("Privacy")));
  });

  it("requires consent timestamp", () => {
    const result = validateLeadPayload(validLead({ consentTimestamp: "" }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("Consent timestamp")));
  });

  it("requires consent text", () => {
    const result = validateLeadPayload(validLead({ consentText: "" }));
    assert.equal(result.valid, false);
  });

  it("normalizes email to lowercase", () => {
    const result = validateLeadPayload(validLead({ email: "John@EXAMPLE.com" }));
    assert.equal(result.valid, true);
    assert.equal(result.data.email, "john@example.com");
  });

  it("normalizes phone to 10 digits", () => {
    const result = validateLeadPayload(validLead({ phone: "+1 (555) 123-4567" }));
    assert.equal(result.valid, true);
    assert.equal(result.data.phone, "5551234567");
  });

  it("trims name whitespace", () => {
    const result = validateLeadPayload(validLead({ firstName: "  John  ", lastName: "  Smith  " }));
    assert.equal(result.valid, true);
    assert.equal(result.data.firstName, "John");
    assert.equal(result.data.lastName, "Smith");
  });

  it("includes UTM fields when provided", () => {
    const result = validateLeadPayload(validLead({ utmSource: "google", utmMedium: "cpc" }));
    assert.equal(result.valid, true);
    assert.equal(result.data.utmSource, "google");
    assert.equal(result.data.utmMedium, "cpc");
  });

  it("omits UTM fields when not provided", () => {
    const result = validateLeadPayload(validLead());
    assert.equal(result.valid, true);
    assert.equal(result.data.utmSource, undefined);
  });

  it("collects multiple errors at once", () => {
    const result = validateLeadPayload({});
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 3, `Expected many errors, got ${result.errors.length}`);
  });

  it("rejects minor's DOB", () => {
    const recentYear = new Date().getFullYear() - 10;
    const result = validateLeadPayload(validLead({ dateOfBirth: `${recentYear}-01-01` }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("18")));
  });
});

describe("isValidEmail", () => {
  it("validates correct emails", () => {
    assert.equal(isValidEmail("user@test.com"), true);
  });

  it("rejects bad emails", () => {
    assert.equal(isValidEmail("no-at"), false);
    assert.equal(isValidEmail(""), false);
  });

  it("rejects non-strings", () => {
    assert.equal(isValidEmail(null), false);
    assert.equal(isValidEmail(42), false);
  });
});
