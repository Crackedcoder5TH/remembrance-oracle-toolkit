/**
 * Agent Lead Submission API
 *
 * POST /api/agent/leads
 *
 * Allows AI agents to submit life insurance leads on behalf of human users.
 * Requires:
 *  1. Valid agent API key (Bearer token)
 *  2. Confirmed consent token from the human
 *  3. Valid lead data (same validation as the web form)
 *
 * This endpoint bypasses CSRF (agents don't use cookies) but enforces
 * consent tokens and rate limiting instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent, verifyConsentToken } from "@/app/lib/agent-auth";
import { insertLead } from "@/app/lib/database";
import type { LeadRecord } from "@/app/lib/database";
import { validateLeadPayload } from "@/app/lib/validation";
import { notifyLeadCreated } from "@/app/lib/webhooks";
import { sendLeadConfirmationEmail, sendAdminNotificationEmail } from "@/app/lib/email";
import { sendLeadSms, sendAdminSms } from "@/app/lib/sms";
import { pushLeadToCrm } from "@/app/lib/crm";
import { broadcast } from "@/app/lib/lead-events";
import { scoreLead } from "@/app/lib/lead-scoring";
import { distributeLead } from "@/app/lib/lead-distribution";
import { checkRateLimit } from "@/app/lib/rate-limit";

function generateLeadId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `lead_${ts}_${rand}`;
}

export async function POST(req: NextRequest) {
  // Authenticate agent
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key. Include Authorization: Bearer <key> header." },
      { status: 401 },
    );
  }

  // Rate limit per agent key (10/min)
  const rateCheck = await checkRateLimit(`agent:${agent.label}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Maximum 10 requests per minute." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = await req.json();

    // Verify consent token
    const { consentToken, ...leadData } = body;
    if (!consentToken || typeof consentToken !== "string") {
      return NextResponse.json(
        { success: false, error: "consentToken is required. Obtain one from POST /api/agent/consent and have the human confirm it." },
        { status: 400 },
      );
    }

    const consent = verifyConsentToken(consentToken);
    if (!consent) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired consent token." },
        { status: 403 },
      );
    }

    if (!consent.confirmed) {
      return NextResponse.json(
        { success: false, error: "Consent token has not been confirmed by the human. They must click the confirmation link first." },
        { status: 403 },
      );
    }

    const consentScope = (consent.scope || "").toLowerCase();
    if (consentScope !== "lead-submission" && consentScope !== "both") {
      return NextResponse.json(
        { success: false, error: "Consent token scope does not include lead-submission." },
        { status: 403 },
      );
    }

    // Build validation payload with TCPA consent from the consent token
    const validationPayload = {
      ...leadData,
      tcpaConsent: true,
      privacyConsent: true,
      consentTimestamp: new Date().toISOString(),
      consentText: `Consent provided via AI agent (${agent.label}) with consent ID ${consent.consentId}. ` +
        "By providing my information through an AI assistant, I consent to be contacted by Valor Legacies " +
        "regarding life insurance options via phone, email, or text at the number/email provided. " +
        "I understand this is not a condition of purchase.",
    };

    // Validate lead data
    const validation = validateLeadPayload(validationPayload);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: "Validation failed.", details: validation.errors },
        { status: 400 },
      );
    }

    const validated = validation.data;
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
      consentIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "agent",
      consentUserAgent: `AI-Agent/${agent.label}`,
      consentPageUrl: `/api/agent/leads (consent: ${consent.consentId})`,
      utmSource: "ai-agent",
      utmMedium: agent.label,
      utmCampaign: validated.utmCampaign || null,
      utmTerm: null,
      utmContent: null,
      createdAt: new Date().toISOString(),
    };

    // Persist to database
    const dbResult = await insertLead(leadRecord);

    if (!dbResult.ok) {
      if (dbResult.error.includes("Duplicate")) {
        return NextResponse.json(
          { success: false, error: "Duplicate lead. This person already submitted within 24 hours." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Failed to store lead. Please retry." },
        { status: 500 },
      );
    }

    // Score and distribute (non-blocking)
    const leadScore = scoreLead(leadRecord);

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

    notifyLeadCreated(leadRecord).catch((err) => console.error("[agent-leads] notifyLeadCreated failed:", err));
    sendLeadConfirmationEmail(leadRecord).catch((err) => console.error("[agent-leads] sendLeadConfirmationEmail failed:", err));
    sendAdminNotificationEmail(leadRecord, leadScore).catch((err) => console.error("[agent-leads] sendAdminNotificationEmail failed:", err));
    sendLeadSms(leadRecord).catch((err) => console.error("[agent-leads] sendLeadSms failed:", err));
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) sendAdminSms(leadRecord, adminPhone).catch((err) => console.error("[agent-leads] sendAdminSms failed:", err));
    pushLeadToCrm(leadRecord).catch((err) => console.error("[agent-leads] pushLeadToCrm failed:", err));
    distributeLead(leadRecord, leadScore).catch((err) => console.error("[agent-leads] distributeLead failed:", err));

    return NextResponse.json({
      success: true,
      leadId,
      message: "Lead submitted successfully. A licensed professional will contact the person soon.",
      score: leadScore.total,
      tier: leadScore.tier,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body. Must be valid JSON." },
      { status: 400 },
    );
  }
}
