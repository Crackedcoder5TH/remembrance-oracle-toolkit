import { NextRequest, NextResponse } from "next/server";
import { insertLead, deleteLeadByEmail } from "@/app/lib/database";
import type { LeadRecord } from "@/app/lib/database";
import { notifyLeadCreated } from "@/app/lib/webhooks";
import { sendLeadConfirmationEmail, sendAdminNotificationEmail } from "@/app/lib/email";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";
import { broadcast } from "@/app/lib/lead-events";
import { scoreLead } from "@/app/lib/lead-scoring";
import { startRequestTimer } from "@/app/lib/logger";
import { validateCsrfToken } from "@/app/lib/csrf";
import { validateLeadPayload, isValidEmail } from "@/app/lib/validation";

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

// Validation now handled by the Armory (app/lib/validation.ts)

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
  const { logger, finish } = startRequestTimer("POST", "/api/leads");

  // --- Rate limit (Oracle PULL: throttle 0.970 → sliding window per-IP) ---
  const clientIp = getClientIp(req.headers);
  const rateCheck = checkRateLimit(clientIp, 5, 60_000); // 5 requests per minute per IP
  if (!rateCheck.allowed) {
    logger.warn("Rate limit exceeded", { clientIp });
    finish(429);
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

  // --- CSRF validation (Drawbridge) ---
  if (!validateCsrfToken(req)) {
    logger.warn("CSRF token mismatch", { clientIp });
    finish(403);
    return NextResponse.json(
      { success: false, message: "Security validation failed. Please refresh the page and try again." },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();

    // Siege Shield: Bot detection (honeypot + timing)
    // 1. Honeypot: if the hidden field has any value, it's a bot
    if (body._hp_website) {
      logger.warn("Honeypot triggered", { clientIp });
      finish(200); // Return fake success to not alert the bot
      return NextResponse.json({
        success: true,
        message: "Your request has been received.",
        leadId: "lead_" + Date.now().toString(36),
        whisper: "Your intention has been noted.",
      });
    }
    // 2. Timing: if submitted faster than 3 seconds after page load, likely a bot
    const MIN_SUBMIT_TIME_MS = 3000;
    if (body._hp_ts && typeof body._hp_ts === "number") {
      const elapsed = Date.now() - body._hp_ts;
      if (elapsed < MIN_SUBMIT_TIME_MS) {
        logger.warn("Timing check failed — too fast", { elapsed, clientIp });
        finish(200); // Fake success
        return NextResponse.json({
          success: true,
          message: "Your request has been received.",
          leadId: "lead_" + Date.now().toString(36),
          whisper: "Your intention has been noted.",
        });
      }
    }

    // Armory: Schema-based validation (replaces inline checks)
    const validation = validateLeadPayload(body);
    if (!validation.valid) {
      logger.warn("Validation failed", { errors: validation.errors, clientIp });
      finish(400);
      return NextResponse.json(
        { success: false, message: validation.errors.join(" ") },
        { status: 400 },
      );
    }

    const validated = validation.data;

    // Build the lead record with full consent metadata (TCPA compliance)
    const leadId = generateLeadId();
    const leadRecord: LeadRecord = {
      leadId,
      firstName: validated.firstName,
      lastName: validated.lastName,
      dateOfBirth: validated.dateOfBirth,
      email: validated.email,
      phone: validated.phone,
      state: validated.state,
      coverageInterest: validated.coverageInterest,
      veteranStatus: validated.veteranStatus,
      militaryBranch: validated.militaryBranch,
      consentTcpa: true,
      consentPrivacy: true,
      consentTimestamp: validated.consentTimestamp,
      consentText: validated.consentText,
      consentIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      consentUserAgent: req.headers.get("user-agent") || "unknown",
      consentPageUrl: req.headers.get("referer") || "/protect",
      utmSource: validated.utmSource || null,
      utmMedium: validated.utmMedium || null,
      utmCampaign: validated.utmCampaign || null,
      utmTerm: validated.utmTerm || null,
      utmContent: validated.utmContent || null,
      createdAt: new Date().toISOString(),
    };

    // Persist to database (Result<T,E> pattern from oracle)
    const dbResult = insertLead(leadRecord);

    if (!dbResult.ok) {
      // Duplicate detection returns a user-friendly message
      if (dbResult.error.includes("Duplicate")) {
        logger.info("Duplicate lead detected", { email: validated.email, clientIp });
        finish(409);
        return NextResponse.json(
          {
            success: false,
            message: "We've already received your request. A licensed professional will be in touch soon.",
          },
          { status: 409 },
        );
      }

      logger.error("Database insert failed", { error: dbResult.error, leadId });
      finish(500);
      return NextResponse.json(
        { success: false, message: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }

    logger.info("Lead stored", { leadId, rowId: dbResult.value.id, state: validated.state, coverageInterest: validated.coverageInterest });

    // Score the lead (used by SSE broadcast and admin email)
    const leadScore = scoreLead(leadRecord);

    // Broadcast real-time event to connected admin dashboards (SSE)
    try {
      broadcast({
        type: "lead.created",
        data: {
          leadId: leadRecord.leadId,
          firstName: leadRecord.firstName,
          lastName: leadRecord.lastName,
          state: leadRecord.state,
          coverageInterest: leadRecord.coverageInterest,
          veteranStatus: leadRecord.veteranStatus,
          score: leadScore.total,
          tier: leadScore.tier,
          createdAt: leadRecord.createdAt,
        },
      });
      logger.debug("SSE broadcast sent", { leadId });
    } catch (err) {
      logger.error("SSE broadcast failed", { leadId, error: String(err) });
    }

    // Fire webhook notifications (non-blocking — doesn't affect response)
    notifyLeadCreated(leadRecord).catch((err) => {
      logger.error("Webhook notification failed", { leadId, error: String(err) });
    });

    // Send confirmation email (non-blocking — doesn't affect response)
    sendLeadConfirmationEmail(leadRecord).catch((err) => {
      logger.error("Email send failed", { leadId, error: String(err) });
    });

    // Messenger Relay: Send admin notification email
    sendAdminNotificationEmail(leadRecord, leadScore).catch((err) => {
      logger.error("Admin notification email failed", { leadId, error: String(err) });
    });

    const whisper = WHISPERS[Math.floor(Math.random() * WHISPERS.length)];

    finish(200, { leadId });
    return NextResponse.json({
      success: true,
      message: "Your request has been received. A licensed insurance professional will contact you soon.",
      leadId,
      whisper,
    });
  } catch {
    finish(400);
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
  const { logger, finish } = startRequestTimer("DELETE", "/api/leads");

  const clientIp = getClientIp(req.headers);
  const rateCheck = checkRateLimit(clientIp, 3, 60_000); // 3 deletion requests per minute
  if (!rateCheck.allowed) {
    logger.warn("Rate limit exceeded on DELETE", { clientIp });
    finish(429);
    return NextResponse.json(
      { success: false, message: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !isValidEmail(email)) {
      logger.warn("Invalid email on CCPA delete", { clientIp });
      finish(400);
      return NextResponse.json(
        { success: false, message: "A valid email address is required to process your deletion request." },
        { status: 400 },
      );
    }

    const result = deleteLeadByEmail(email);

    if (!result.ok) {
      logger.error("CCPA delete failed", { error: result.error, clientIp });
      finish(500);
      return NextResponse.json(
        { success: false, message: "Something went wrong processing your request." },
        { status: 500 },
      );
    }

    logger.info("CCPA delete completed", { deleted: result.value.deleted, clientIp });
    finish(200, { deleted: result.value.deleted });

    // Always return success even if no records found (privacy — don't reveal existence)
    return NextResponse.json({
      success: true,
      message: "Your data deletion request has been processed. Any records associated with your email have been removed.",
      deleted: result.value.deleted,
    });
  } catch {
    finish(400);
    return NextResponse.json(
      { success: false, message: "Invalid request." },
      { status: 400 },
    );
  }
}
