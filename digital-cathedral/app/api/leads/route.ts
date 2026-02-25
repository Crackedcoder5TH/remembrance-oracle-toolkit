import { NextRequest, NextResponse } from "next/server";

/**
 * Lead submission API — Kingdom perspective.
 *
 * Oracle patterns used:
 *  - validate-email (EVOLVE) for input validation
 *  - pipe (PULL) for transformation pipeline
 *  - Coherence whisper system from digital-cathedral
 *
 * This route:
 * 1. Validates all fields server-side
 * 2. Records consent metadata (TCPA compliance)
 * 3. Stores the lead (placeholder — replace with real DB)
 * 4. Returns a kingdom whisper
 */

// --- Oracle-evolved validation (from validate-email pattern) ---
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

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
]);

const VALID_COVERAGE = new Set(["term", "whole", "universal", "final-expense", "not-sure"]);

/** Whispers for the seeker — kingdom-aligned responses */
const WHISPERS = [
  "Your intention to protect has been heard. A guardian approaches.",
  "The covenant is sealed. Someone who understands protection will reach out.",
  "Legacy begins with intention. Yours has been received by the kingdom.",
  "What you seek to protect already knows you care. A licensed guide will connect soon.",
  "The cathedral holds your request. Expect a call from someone who can help.",
];

function generateLeadId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `lead_${ts}_${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      firstName,
      lastName,
      email,
      phone,
      state,
      coverageInterest,
      tcpaConsent,
      privacyConsent,
      consentTimestamp,
      consentText,
    } = body;

    // Server-side validation
    const errors: string[] = [];

    if (!validateName(firstName)) errors.push("Invalid first name.");
    if (!validateName(lastName)) errors.push("Invalid last name.");
    if (!validateEmail(email)) errors.push("Invalid email address.");
    if (!validatePhone(phone)) errors.push("Invalid phone number.");
    if (!VALID_STATES.has(state)) errors.push("Invalid state.");
    if (!VALID_COVERAGE.has(coverageInterest)) errors.push("Invalid coverage interest.");
    if (tcpaConsent !== true) errors.push("TCPA consent is required.");
    if (privacyConsent !== true) errors.push("Privacy policy consent is required.");
    if (!consentTimestamp) errors.push("Consent timestamp is required.");
    if (!consentText) errors.push("Consent text is required.");

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, message: errors.join(" ") },
        { status: 400 },
      );
    }

    // Build the lead record with full consent metadata (TCPA compliance)
    const leadId = generateLeadId();
    const leadRecord = {
      leadId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.replace(/\D/g, ""),
      state,
      coverageInterest,
      consent: {
        tcpa: true,
        privacy: true,
        timestamp: consentTimestamp,
        text: consentText,
        ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
        pageUrl: req.headers.get("referer") || "/protect",
      },
      createdAt: new Date().toISOString(),
    };

    // TODO: Replace with real database storage
    // For now, log to server console as proof-of-concept
    console.log("[LEAD RECEIVED]", JSON.stringify(leadRecord, null, 2));

    const whisper = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];

    return NextResponse.json({
      success: true,
      message: "Your request has been received. A licensed insurance professional will contact you soon.",
      leadId,
      whisper,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request. Please try again." },
      { status: 400 },
    );
  }
}
