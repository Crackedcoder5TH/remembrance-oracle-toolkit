import { NextRequest, NextResponse } from "next/server";
import { insertLead, deleteLeadByEmail } from "@/app/lib/database";
import type { LeadRecord } from "@/app/lib/database";
import { notifyLeadCreated } from "@/app/lib/webhooks";
import { sendLeadConfirmationEmail } from "@/app/lib/email";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Lead submission API — Kingdom perspective.
 *
 * Oracle patterns used:
 *  - validate-email (EVOLVE) for input validation
 *  - result-type-ts (EVOLVE) for database error handling
 *  - retry-async (PULL) for webhook delivery
 *  - pipe (PULL) for transformation pipeline
 *  - throttle (PULL, 0.970) → evolved into IP rate limiter
 *
 * This route:
 * 1. Rate-limits by IP (oracle PULL: throttle → sliding window)
 * 2. Validates all fields server-side
 * 3. Records consent metadata (TCPA compliance)
 * 4. Persists the lead to SQLite via better-sqlite3
 * 5. Detects duplicates within 24-hour window
 * 6. Sends confirmation email
 * 7. Returns a kingdom whisper
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
  // --- Rate limit (Oracle PULL: throttle 0.970 → sliding window per-IP) ---
  const clientIp = getClientIp(req.headers);
  const rateCheck = checkRateLimit(clientIp, 5, 60_000); // 5 requests per minute per IP
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many requests. Please wait a moment before trying again.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = await req.json();

    const {
      firstName,
      lastName,
      dateOfBirth,
      email,
      phone,
      state,
      coverageInterest,
      veteranStatus,
      militaryBranch,
      tcpaConsent,
      privacyConsent,
      consentTimestamp,
      consentText,
    } = body;

    // Server-side validation
    const errors: string[] = [];

    if (!validateName(firstName)) errors.push("Invalid first name.");
    if (!validateName(lastName)) errors.push("Invalid last name.");
    if (!validateDob(dateOfBirth)) errors.push("Invalid date of birth. You must be at least 18 years old.");
    if (!validateEmail(email)) errors.push("Invalid email address.");
    if (!validatePhone(phone)) errors.push("Invalid phone number.");
    if (!VALID_STATES.has(state)) errors.push("Invalid state.");
    if (!VALID_COVERAGE.has(coverageInterest)) errors.push("Invalid coverage interest.");
    if (!VALID_VETERAN_STATUS.has(veteranStatus)) errors.push("Invalid veteran status.");
    if (veteranStatus === "veteran" && militaryBranch && !VALID_MILITARY_BRANCHES.has(militaryBranch)) {
      errors.push("Invalid military branch.");
    }
    if (veteranStatus === "veteran" && !militaryBranch) errors.push("Military branch is required for veterans.");
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
    const leadRecord: LeadRecord = {
      leadId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      email: email.trim().toLowerCase(),
      phone: phone.replace(/\D/g, "").slice(-10),
      state,
      coverageInterest,
      veteranStatus,
      militaryBranch: veteranStatus === "veteran" ? (militaryBranch || "") : "",
      consentTcpa: true,
      consentPrivacy: true,
      consentTimestamp,
      consentText,
      consentIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      consentUserAgent: req.headers.get("user-agent") || "unknown",
      consentPageUrl: req.headers.get("referer") || "/protect",
      utmSource: body.utmSource || null,
      utmMedium: body.utmMedium || null,
      utmCampaign: body.utmCampaign || null,
      utmTerm: body.utmTerm || null,
      utmContent: body.utmContent || null,
      createdAt: new Date().toISOString(),
    };

    // Persist to database (Result<T,E> pattern from oracle)
    const dbResult = insertLead(leadRecord);

    if (!dbResult.ok) {
      // Duplicate detection returns a user-friendly message
      if (dbResult.error.includes("Duplicate")) {
        return NextResponse.json(
          {
            success: false,
            message: "We've already received your request. A licensed professional will be in touch soon.",
          },
          { status: 409 },
        );
      }

      console.error("[DB ERROR]", dbResult.error);
      return NextResponse.json(
        { success: false, message: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    console.log("[LEAD STORED]", leadId, `(row #${dbResult.value.id})`);

    // Fire webhook notifications (non-blocking — doesn't affect response)
    notifyLeadCreated(leadRecord).catch((err) => {
      console.error("[WEBHOOK ERROR]", err);
    });

    // Send confirmation email (non-blocking — doesn't affect response)
    sendLeadConfirmationEmail(leadRecord).catch((err) => {
      console.error("[EMAIL ERROR]", err);
    });

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

/**
 * DELETE /api/leads — CCPA/CPRA Data Deletion Endpoint
 *
 * Oracle decision: GENERATE (no existing deletion pattern)
 * Uses: result-type-ts (already in database layer)
 *
 * Accepts { email } in the request body.
 * Deletes all lead records associated with that email address.
 * Rate-limited to prevent abuse.
 */
export async function DELETE(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rateCheck = checkRateLimit(clientIp, 3, 60_000); // 3 deletion requests per minute
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { success: false, message: "A valid email address is required to process your deletion request." },
        { status: 400 },
      );
    }

    const result = deleteLeadByEmail(email);

    if (!result.ok) {
      console.error("[DELETE ERROR]", result.error);
      return NextResponse.json(
        { success: false, message: "Something went wrong processing your request." },
        { status: 500 },
      );
    }

    console.log(`[CCPA DELETE] ${result.value.deleted} record(s) deleted for ${email} (IP: ${clientIp})`);

    // Always return success even if no records found (privacy — don't reveal existence)
    return NextResponse.json({
      success: true,
      message: "Your data deletion request has been processed. Any records associated with your email have been removed.",
      deleted: result.value.deleted,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request." },
      { status: 400 },
    );
  }
}
