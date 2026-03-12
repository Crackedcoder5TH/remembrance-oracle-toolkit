/**
 * Agent Human Registration API
 *
 * POST /api/agent/register
 *
 * Allows AI agents to register their human counterpart as a client (lead buyer)
 * on the Valor Legacies platform. Requires a confirmed consent token with
 * scope "account-registration" or "both".
 *
 * The human gets a temporary password emailed to them which they can change
 * on first login.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent, verifyConsentToken } from "@/app/lib/agent-auth";
import { createClient, getClientByEmail } from "@/app/lib/client-database";
import { hashPassword } from "@/app/lib/password";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { isValidEmail } from "@/app/lib/validation";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  // Authenticate agent
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key." },
      { status: 401 },
    );
  }

  // Rate limit (5/min per agent — registration is slower)
  const rateCheck = checkRateLimit(`agent-register:${agent.label}`, 5, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { email, firstName, lastName, phone, state, consentToken } = body;

    // Validate consent token
    if (!consentToken || typeof consentToken !== "string") {
      return NextResponse.json(
        { success: false, error: "consentToken is required. Obtain one from POST /api/agent/consent." },
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
        { success: false, error: "Consent has not been confirmed by the human yet." },
        { status: 403 },
      );
    }

    if (consent.scope !== "account-registration" && consent.scope !== "both") {
      return NextResponse.json(
        { success: false, error: "Consent token scope does not include account-registration." },
        { status: 403 },
      );
    }

    // Validate required fields
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "Valid email is required." }, { status: 400 });
    }
    if (!firstName || typeof firstName !== "string" || firstName.trim().length < 2) {
      return NextResponse.json({ success: false, error: "firstName is required (min 2 chars)." }, { status: 400 });
    }
    if (!lastName || typeof lastName !== "string" || lastName.trim().length < 2) {
      return NextResponse.json({ success: false, error: "lastName is required (min 2 chars)." }, { status: 400 });
    }

    // Check if account exists
    const existing = await getClientByEmail(email.trim().toLowerCase());
    if (!existing.ok) {
      return NextResponse.json({ success: false, error: "Service unavailable." }, { status: 503 });
    }
    if (existing.value) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists.", loginUrl: "/portal/login" },
        { status: 409 },
      );
    }

    // Generate a temporary password for the user
    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    // Create client record
    const clientId = `client_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const result = await createClient({
      clientId,
      companyName: `${firstName.trim()} ${lastName.trim()}`,
      contactName: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim().toLowerCase(),
      phone: (phone || "").trim(),
      passwordHash,
      status: "active",
      pricingTier: "standard",
      pricePerLead: 8000, // $80 in cents
      exclusivePrice: 12000, // $120 in cents
      stateLicenses: state ? JSON.stringify([state]) : "[]",
      coverageTypes: "[]",
      dailyCap: 10,
      monthlyCap: 100,
      minScore: 55,
      balance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to create account. Please try again." },
        { status: 500 },
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com";

    return NextResponse.json({
      success: true,
      message: `Account created for ${firstName} ${lastName}. A temporary password has been generated.`,
      loginUrl: `${siteUrl}/portal/login`,
      temporaryPassword: tempPassword,
      instructions: {
        forAgent: "Provide the loginUrl and temporaryPassword to the human so they can sign in and change their password.",
        forHuman: `Your Valor Legacies account has been created. Sign in at ${siteUrl}/portal/login with your email (${email}) and temporary password. Please change your password after first login.`,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }
}
