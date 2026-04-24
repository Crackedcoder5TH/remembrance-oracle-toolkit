import { NextRequest, NextResponse } from "next/server";
import { insertLead, deleteLeadByEmail } from "@/app/lib/database";
import type { LeadRecord } from "@/app/lib/database";
import { notifyLeadCreated } from "@/app/lib/webhooks";
import { sendLeadConfirmationEmail, sendAdminNotificationEmail } from "@/app/lib/email";
import { sendLeadSms, sendAdminSms } from "@/app/lib/sms";
import { pushLeadToCrm } from "@/app/lib/crm";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";
import { broadcast } from "@/app/lib/lead-events";
import { scoreLead } from "@/app/lib/lead-scoring";
import { distributeLead } from "@/app/lib/lead-distribution";
import { startRequestTimer } from "@/app/lib/logger";
import { validateCsrfToken } from "@/app/lib/csrf";
import { validateLeadPayload, isValidEmail } from "@/app/lib/validation";
import { evaluateCovenant } from "@/app/lib/valor/covenant-gate";
import { LEXICON, confirmationFor } from "@/app/lib/valor/lexicon";
import { appendLedgerEntry } from "@/app/lib/valor/lead-ledger";

/**
 * Lead submission API.
 *
 * This route:
 * 1. Rate-limits by IP (sliding window)
 * 2. Validates all fields server-side
 * 3. Records consent metadata (TCPA compliance)
 * 4. Persists the lead to database (PostgreSQL in production, SQLite in dev)
 * 5. Detects duplicates within 24-hour window
 * 6. Sends confirmation email + SMS
 * 7. Pushes lead to CRM (HubSpot / Salesforce)
 * 8. Returns a confirmation message
 */

// Validation handled by app/lib/validation.ts

/**
 * Fallback confirmation messages — used only when the covenant evaluator
 * can't determine a tier. Tier-matched messages live in valor/lexicon.
 */
const FALLBACK_CONFIRMATIONS = [
  "Your request has been received. A licensed professional will reach out soon.",
  "Thank you for taking the first step. Someone who understands military coverage will be in touch.",
  "Your information is secure. A licensed insurance professional will contact you shortly.",
  "We've received your request. Expect a call or email within 1 business day.",
  "You're one step closer to protecting your family. A professional will reach out soon.",
];

function generateLeadId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `lead_${ts}_${rand}`;
}

export async function POST(req: NextRequest) {
  const { logger, finish } = startRequestTimer("POST", "/api/leads");

  // Rate limit (sliding window per-IP)
  const clientIp = getClientIp(req.headers);
  const rateCheck = await checkRateLimit(clientIp, 5, 60_000); // 5 requests per minute per IP
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

  // CSRF validation
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

    // Fast-path bot detection (honeypot). This catches the obvious case
    // before any coherency math runs. The resonance cascade below handles
    // every subtler variant via archetype matching.
    if (body._hp_website) {
      logger.warn("Honeypot triggered", { clientIp });
      finish(200); // Silent-success per covenant gate: bot sees no signal.
      return NextResponse.json({
        success: true,
        message: LEXICON.tooFastOrBot,
        leadId: "lead_" + Date.now().toString(36),
        confirmationMessage: LEXICON.tooFastOrBot,
      });
    }

    // Capture behavioral signals for the resonance layer. Absent → neutral.
    const submitElapsedMs = (typeof body._hp_ts === "number" && body._hp_ts > 0)
      ? Math.max(0, Date.now() - body._hp_ts)
      : undefined;
    const stepTimingsMs = Array.isArray(body._hp_step_ms)
      ? body._hp_step_ms.filter((t: unknown): t is number =>
          typeof t === "number" && Number.isFinite(t) && t >= 0)
      : undefined;

    // Schema-based validation
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

    // ── Covenant Gate ──────────────────────────────────────────
    // Coherency-native admission. Reduces the lead to its 16-dimensional
    // shape, cascades it against the archetype library, and returns a
    // verdict. Silent-rejects bot/fraud archetypes with fake-success so
    // automated attackers get no adjustment signal; soft-rejects below-
    // gate leads with a proper decline. Admitted leads continue to DB.
    const covenant = evaluateCovenant({
      coverageInterest: validated.coverageInterest,
      purchaseIntent: validated.purchaseIntent,
      veteranStatus: validated.veteranStatus,
      militaryBranch: validated.militaryBranch,
      state: validated.state,
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: validated.email,
      phone: validated.phone,
      dateOfBirth: validated.dateOfBirth,
      consentTcpa: true,
      consentPrivacy: true,
      consentText: validated.consentText,
      consentTimestamp: validated.consentTimestamp,
      utmSource: validated.utmSource,
      utmMedium: validated.utmMedium,
      utmCampaign: validated.utmCampaign,
      submitElapsedMs,
      stepTimingsMs,
      createdAt: new Date().toISOString(),
    });

    if (covenant.verdict === "silent-reject-bot"
        || covenant.verdict === "silent-reject-fraud") {
      logger.warn("Covenant gate silent-rejected", {
        verdict: covenant.verdict,
        reason: covenant.reason,
        coherency: covenant.coherency.score,
        dominantArchetype: covenant.coherency.dominantArchetype,
        clientIp,
      });
      finish(200); // Silent-success — same pattern as honeypot.
      return NextResponse.json({
        success: true,
        message: LEXICON.tooFastOrBot,
        leadId: "lead_" + Date.now().toString(36),
        confirmationMessage: LEXICON.tooFastOrBot,
      });
    }

    if (covenant.verdict === "soft-reject-low") {
      logger.info("Covenant gate soft-rejected", {
        reason: covenant.reason,
        coherency: covenant.coherency.score,
        clientIp,
      });
      finish(422);
      return NextResponse.json(
        {
          success: false,
          message:
            "We couldn't verify enough information to route your request. Please review your entries and try again.",
        },
        { status: 422 },
      );
    }

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
      purchaseIntent: validated.purchaseIntent,
      veteranStatus: validated.veteranStatus,
      militaryBranch: validated.militaryBranch,
      consentTcpa: true,
      consentPrivacy: true,
      consentTimestamp: validated.consentTimestamp,
      consentText: validated.consentText,
      consentIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      consentUserAgent: req.headers.get("user-agent") || "unknown",
      consentPageUrl: req.headers.get("referer") || "/",
      utmSource: validated.utmSource || null,
      utmMedium: validated.utmMedium || null,
      utmCampaign: validated.utmCampaign || null,
      utmTerm: validated.utmTerm || null,
      utmContent: validated.utmContent || null,
      createdAt: new Date().toISOString(),
    };

    // Persist to database
    const dbResult = await insertLead(leadRecord);

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

    logger.info("Lead stored", {
      leadId, rowId: dbResult.value.id,
      state: validated.state,
      coverageInterest: validated.coverageInterest,
      coherency: covenant.coherency.score,
      tier: covenant.coherency.tier,
      archetype: covenant.coherency.dominantArchetype,
    });

    // The lead score surface is kept stable for downstream consumers (SSE,
    // admin email, distribution). The scoreLead shim now delegates to the
    // coherency cascade and projects back into the legacy LeadScore shape,
    // so nothing downstream has to change.
    const leadScore = scoreLead(leadRecord);

    // ── Lead Ledger ─────────────────────────────────────────────
    // Append-only JSONL record of every admitted lead. Accessible to the
    // admin side via /api/admin/ledger. Independent of the DB so the
    // covenant record survives even if the database is rotated, migrated,
    // or temporarily unavailable. Non-blocking — write failures are logged
    // but never affect the lead submission response.
    appendLedgerEntry({
      leadId,
      writtenAt: new Date().toISOString(),
      observedAt: leadRecord.createdAt,
      lead: {
        firstName: leadRecord.firstName,
        lastName: leadRecord.lastName,
        email: leadRecord.email,
        phone: leadRecord.phone,
        state: leadRecord.state,
        dateOfBirth: leadRecord.dateOfBirth,
        coverageInterest: leadRecord.coverageInterest,
        purchaseIntent: leadRecord.purchaseIntent,
        veteranStatus: leadRecord.veteranStatus,
        militaryBranch: leadRecord.militaryBranch,
      },
      coherency: {
        score: covenant.coherency.score,
        tier: covenant.coherency.tier,
        dominantArchetype: covenant.coherency.dominantArchetype,
        dominantGroup: covenant.coherency.dominantGroup,
        shape: covenant.coherency.shape,
      },
      covenant: {
        verdict: covenant.verdict,
        reason: covenant.reason,
      },
      source: {
        ip: leadRecord.consentIp,
        userAgent: leadRecord.consentUserAgent,
        referer: leadRecord.consentPageUrl,
        utmSource: leadRecord.utmSource,
        utmMedium: leadRecord.utmMedium,
        utmCampaign: leadRecord.utmCampaign,
      },
    }).then((result) => {
      if (!result.ok) {
        logger.error("Lead ledger write failed", { leadId, error: result.error });
      } else {
        logger.debug("Lead ledger appended", { leadId, location: result.location });
      }
    }).catch((err) => {
      logger.error("Lead ledger threw", { leadId, error: String(err) });
    });

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

    // Send admin notification email
    sendAdminNotificationEmail(leadRecord, leadScore).catch((err) => {
      logger.error("Admin notification email failed", { leadId, error: String(err) });
    });

    // Send SMS notifications (non-blocking — doesn't affect response)
    sendLeadSms(leadRecord).catch((err) => {
      logger.error("Lead SMS failed", { leadId, error: String(err) });
    });

    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      sendAdminSms(leadRecord, adminPhone).catch((err) => {
        logger.error("Admin SMS failed", { leadId, error: String(err) });
      });
    }

    // Push lead to CRM (non-blocking — doesn't affect response)
    pushLeadToCrm(leadRecord).catch((err) => {
      logger.error("CRM push failed", { leadId, error: String(err) });
    });

    // Distribute lead to matching client buyers (non-blocking)
    distributeLead(leadRecord, leadScore).then((distResult) => {
      if (distResult.distributed) {
        logger.info("Lead distributed", { leadId, purchases: distResult.purchases.length });
      }
    }).catch((err) => {
      logger.error("Lead distribution failed", { leadId, error: String(err) });
    });

    // Tier-matched confirmation from the Remembrance lexicon. Falls back to
    // the rotating set only if the tier isn't mapped.
    const confirmationMessage =
      confirmationFor(covenant.coherency.tier) ||
      FALLBACK_CONFIRMATIONS[Math.floor(Math.random() * FALLBACK_CONFIRMATIONS.length)];

    finish(200, { leadId });
    return NextResponse.json({
      success: true,
      message: "Your request has been received. A licensed insurance professional will contact you soon.",
      leadId,
      confirmationMessage,
      coherency: {
        score: Number(covenant.coherency.score.toFixed(4)),
        tier: covenant.coherency.tier,
        dominantArchetype: covenant.coherency.dominantArchetype,
        // 16-D normalized lead shape — powers the CoherencyPulse visualization
        // on the confirmation screen so the submitter sees their own signal.
        shape: covenant.coherency.shape,
      },
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
 * Accepts { email } in the request body.
 * Deletes all lead records associated with that email address.
 * Rate-limited to prevent abuse.
 */
export async function DELETE(req: NextRequest) {
  const { logger, finish } = startRequestTimer("DELETE", "/api/leads");

  const clientIp = getClientIp(req.headers);
  const rateCheck = await checkRateLimit(clientIp, 3, 60_000); // 3 deletion requests per minute
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

    const result = await deleteLeadByEmail(email);

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
