/**
 * Agent Consent Flow
 *
 * POST /api/agent/consent — Create a consent request (agent-facing)
 * GET  /api/agent/consent?token=<token> — Confirm consent (human-facing)
 *
 * AI agents must obtain explicit human consent before submitting leads
 * or registering accounts. The flow:
 *
 * 1. Agent calls POST with the human's email + scope
 * 2. Server returns a consentId + confirmationUrl
 * 3. Human clicks the confirmationUrl (or agent shows it to them)
 * 4. Server confirms the consent and returns a confirmed token
 * 5. Agent uses the confirmed token for lead submission or registration
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateAgent,
  createConsentToken,
  confirmConsentToken,
  verifyConsentToken,
} from "@/app/lib/agent-auth";
import { isValidEmail } from "@/app/lib/validation";
import { checkRateLimit } from "@/app/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Authenticate agent
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key." },
      { status: 401 },
    );
  }

  // Rate limit (10/min per agent)
  const rateCheck = checkRateLimit(`agent-consent:${agent.label}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { email, firstName, agentIdentity, scope } = body;

    // Validate inputs
    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (!firstName || typeof firstName !== "string" || firstName.trim().length < 1) {
      return NextResponse.json(
        { success: false, error: "firstName is required." },
        { status: 400 },
      );
    }

    if (!agentIdentity || typeof agentIdentity !== "string") {
      return NextResponse.json(
        { success: false, error: "agentIdentity is required (name of the AI agent/model)." },
        { status: 400 },
      );
    }

    const validScopes = ["lead-submission", "account-registration", "both"];
    if (!scope || !validScopes.includes(scope)) {
      return NextResponse.json(
        { success: false, error: `scope must be one of: ${validScopes.join(", ")}` },
        { status: 400 },
      );
    }

    // Create consent token
    const { token, consentId, expiresAt } = createConsentToken(
      email.trim().toLowerCase(),
      scope,
      agentIdentity,
    );

    // Build confirmation URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com";
    const confirmationUrl = `${siteUrl}/api/agent/consent?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      consentId,
      confirmationUrl,
      pendingToken: token,
      expiresAt,
      message: `Consent request created for ${firstName} (${email}). ` +
        "The human must visit the confirmation URL to approve. " +
        "Once confirmed, use the returned confirmed token for subsequent API calls.",
      instructions: {
        forAgent: "Show the confirmationUrl to the human user and ask them to click it to approve.",
        forHuman: `${firstName}, please visit this link to confirm that you authorize ${agentIdentity} to act on your behalf: ${confirmationUrl}`,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }
}

/**
 * GET /api/agent/consent?token=<token>
 *
 * Human-facing confirmation endpoint. When a human clicks the confirmation link,
 * this verifies the token and returns a confirmed version.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(renderConsentPage("Missing Token", "No consent token was provided.", null), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Verify the pending token
  const decoded = verifyConsentToken(token);
  if (!decoded) {
    return new NextResponse(
      renderConsentPage("Invalid or Expired", "This consent link is invalid or has expired. Please ask the AI assistant for a new one.", null),
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  if (decoded.confirmed) {
    return new NextResponse(
      renderConsentPage("Already Confirmed", "This consent has already been confirmed. You can close this page.", decoded),
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  }

  // Confirm the token
  const confirmed = confirmConsentToken(token);
  if (!confirmed) {
    return new NextResponse(
      renderConsentPage("Confirmation Failed", "Unable to confirm this consent. The link may have expired.", null),
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  // Return HTML page with the confirmed token displayed
  return new NextResponse(
    renderConsentPage("Consent Confirmed", null, confirmed.payload, confirmed.token),
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

function renderConsentPage(
  title: string,
  errorMessage: string | null,
  consent: { email: string; scope: string; agentLabel: string } | null,
  confirmedToken?: string,
): string {
  const scopeLabel = consent?.scope === "both"
    ? "submit life insurance leads and create an account"
    : consent?.scope === "lead-submission"
      ? "submit life insurance leads"
      : "create an account";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Valor Legacies</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 520px; width: 100%; border: 1px solid #334155; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #f8fafc; }
    p { margin-bottom: 1rem; line-height: 1.6; color: #94a3b8; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .token-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 1rem; word-break: break-all; font-family: monospace; font-size: 0.75rem; color: #67e8f9; margin: 1rem 0; max-height: 120px; overflow-y: auto; }
    .info { background: #1e3a5f; border: 1px solid #2563eb; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .info p { color: #93c5fd; margin-bottom: 0; }
    .badge { display: inline-block; background: #2563eb; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${errorMessage ? `<p class="error">${errorMessage}</p>` : ""}
    ${consent && confirmedToken ? `
      <p class="success">You have authorized <strong>${consent.agentLabel}</strong> to ${scopeLabel} on your behalf.</p>
      <div class="info">
        <p>Your AI assistant will use this confirmation automatically. If asked, provide this token:</p>
      </div>
      <div class="token-box">${confirmedToken}</div>
      <p>This authorization expires in 24 hours. You can revoke it at any time by contacting support.</p>
      <p><span class="badge">${consent.scope}</span></p>
    ` : ""}
    ${consent && !confirmedToken && !errorMessage ? `
      <p>Consent for <strong>${consent.email}</strong> via <strong>${consent.agentLabel}</strong>.</p>
      <p>Scope: <span class="badge">${consent.scope}</span></p>
    ` : ""}
  </div>
</body>
</html>`;
}
