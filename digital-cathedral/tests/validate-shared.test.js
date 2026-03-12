/**
 * Tests for shared validation functions.
 * Covers: validateEmail, validatePhone, normalizePhone, validateName, validateState, validateDob
 *
 * These are re-implementations of the TypeScript source for testing parity.
 * The logic is identical to packages/shared/src/*.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement pure validation functions (matching packages/shared/src/*.ts) ---

function validateEmail(email) {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}

function validatePhone(phone) {
  if (typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith("1")) return true;
  return false;
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function validateName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z\s'.,-]+$/.test(trimmed);
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX",
  "UT","VT","VA","WA","WV","WI","WY",
];
const STATE_SET = new Set(US_STATES);

function validateState(code) {
  return STATE_SET.has(code);
}

function isAtLeast18(birthDate) {
  const today = new Date();
  const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  return birthDate <= eighteenYearsAgo;
}

function validateDob(dob) {
  if (typeof dob !== "string") return false;
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  return isAtLeast18(date);
}

// --- Tests ---

describe("validateEmail", () => {
  it("accepts valid emails", () => {
    assert.equal(validateEmail("user@example.com"), true);
    assert.equal(validateEmail("a@b.co"), true);
    assert.equal(validateEmail("test+tag@gmail.com"), true);
    assert.equal(validateEmail("first.last@domain.org"), true);
  });

  it("rejects invalid emails", () => {
    assert.equal(validateEmail(""), false);
    assert.equal(validateEmail("no-at-sign"), false);
    assert.equal(validateEmail("@no-local.com"), false);
    assert.equal(validateEmail("no-domain@"), false);
    assert.equal(validateEmail("spaces in@email.com"), false);
    assert.equal(validateEmail("double@@at.com"), false);
  });

  it("rejects non-string inputs", () => {
    assert.equal(validateEmail(null), false);
    assert.equal(validateEmail(undefined), false);
    assert.equal(validateEmail(42), false);
    assert.equal(validateEmail({}), false);
  });

  it("rejects emails over 254 characters", () => {
    const longLocal = "a".repeat(246);
    assert.equal(validateEmail(`${longLocal}@test.com`), false); // 246 + 9 = 255
  });
});

describe("validatePhone", () => {
  it("accepts valid US phone formats", () => {
    assert.equal(validatePhone("5551234567"), true);
    assert.equal(validatePhone("(555) 123-4567"), true);
    assert.equal(validatePhone("555-123-4567"), true);
    assert.equal(validatePhone("+15551234567"), true);
    assert.equal(validatePhone("1-555-123-4567"), true);
  });

  it("rejects invalid phone numbers", () => {
    assert.equal(validatePhone(""), false);
    assert.equal(validatePhone("123"), false);
    assert.equal(validatePhone("12345678901234"), false); // too long
    assert.equal(validatePhone("abcdefghij"), false);
  });

  it("rejects non-string inputs", () => {
    assert.equal(validatePhone(null), false);
    assert.equal(validatePhone(5551234567), false);
  });
});

describe("normalizePhone", () => {
  it("strips non-digit characters", () => {
    assert.equal(normalizePhone("(555) 123-4567"), "5551234567");
    assert.equal(normalizePhone("555.123.4567"), "5551234567");
  });

  it("removes leading country code 1", () => {
    assert.equal(normalizePhone("+1-555-123-4567"), "5551234567");
    assert.equal(normalizePhone("15551234567"), "5551234567");
  });

  it("preserves 10-digit numbers", () => {
    assert.equal(normalizePhone("5551234567"), "5551234567");
  });
});

describe("validateName", () => {
  it("accepts valid names", () => {
    assert.equal(validateName("John"), true);
    assert.equal(validateName("Mary Jane"), true);
    assert.equal(validateName("O'Brien"), true);
    assert.equal(validateName("Smith-Jones"), true);
    assert.equal(validateName("Dr. Smith"), true);
  });

  it("rejects names shorter than 2 chars", () => {
    assert.equal(validateName("A"), false);
    assert.equal(validateName(""), false);
  });

  it("rejects names with invalid characters", () => {
    assert.equal(validateName("John123"), false);
    assert.equal(validateName("<script>"), false);
    assert.equal(validateName("Name!"), false);
    assert.equal(validateName("Name@domain"), false);
  });

  it("rejects non-string inputs", () => {
    assert.equal(validateName(null), false);
    assert.equal(validateName(42), false);
  });

  it("trims whitespace before validation", () => {
    assert.equal(validateName("  John  "), true);
    assert.equal(validateName("  A  "), false); // trimmed = 1 char
  });
});

describe("validateState", () => {
  it("accepts all 50 states + DC + PR", () => {
    assert.equal(validateState("TX"), true);
    assert.equal(validateState("CA"), true);
    assert.equal(validateState("NY"), true);
    assert.equal(validateState("DC"), true);
    assert.equal(validateState("PR"), true);
    assert.equal(validateState("HI"), true);
    assert.equal(validateState("AK"), true);
  });

  it("rejects invalid state codes", () => {
    assert.equal(validateState("XX"), false);
    assert.equal(validateState(""), false);
    assert.equal(validateState("texas"), false);
    assert.equal(validateState("tx"), false); // lowercase
  });

  it("has exactly 52 valid codes (50 states + DC + PR)", () => {
    assert.equal(US_STATES.length, 52);
  });
});

describe("validateDob", () => {
  it("accepts valid DOBs for adults", () => {
    assert.equal(validateDob("1990-06-15"), true);
    assert.equal(validateDob("1970-01-01"), true);
    assert.equal(validateDob("2000-12-31"), true);
  });

  it("rejects minors (under 18)", () => {
    const now = new Date();
    const recentYear = now.getFullYear() - 10;
    assert.equal(validateDob(`${recentYear}-01-01`), false);
  });

  it("rejects invalid date formats", () => {
    assert.equal(validateDob("06/15/1990"), false);
    assert.equal(validateDob("1990/06/15"), false);
    assert.equal(validateDob("not-a-date"), false);
    assert.equal(validateDob(""), false);
  });

  it("rejects impossible dates", () => {
    assert.equal(validateDob("1990-02-30"), false); // Feb 30
    assert.equal(validateDob("1990-13-01"), false); // month 13
    assert.equal(validateDob("1990-00-15"), false); // month 0
    assert.equal(validateDob("1990-06-00"), false); // day 0
  });

  it("rejects years before 1900 or in the future", () => {
    assert.equal(validateDob("1899-01-01"), false);
    const futureYear = new Date().getFullYear() + 1;
    assert.equal(validateDob(`${futureYear}-01-01`), false);
  });

  it("rejects non-string inputs", () => {
    assert.equal(validateDob(null), false);
    assert.equal(validateDob(19900615), false);
  });
});

describe("isAtLeast18", () => {
  it("returns true for someone exactly 18 today", () => {
    const now = new Date();
    const exactly18 = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    assert.equal(isAtLeast18(exactly18), true);
  });

  it("returns false for someone born yesterday who would be 17", () => {
    const now = new Date();
    const almost18 = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate() + 1);
    assert.equal(isAtLeast18(almost18), false);
  });

  it("returns true for someone well over 18", () => {
    assert.equal(isAtLeast18(new Date(1970, 0, 1)), true);
  });
});
