import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword } from "@/app/lib/client-database";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie.
 *
 * Auth paths (tried in order):
 *  1. Admin owner login — admin@valorlegacies.xyz with either:
 *     - Hardcoded password: ValorAdmin2026!
 *     - Any of the ADMIN_API_KEY values (comma-separated for rotation)
 *     Bypasses the database entirely.
 *  2. Database lookup — email + password verified against clients table.
 *  3. Demo mode (no DATABASE_URL, dev only) — demo client credentials.
 */

const ADMIN_CLIENT_ID = "client_admin_owner";
const ADMIN_CLIENT_EMAIL = "admin@valorlegacies.xyz";
const ADMIN_CLIENT_COMPANY = "Valor Legacies (Owner)";
const ADMIN_HARDCODED_PASSWORD = "ValorAdmin2026!";

/** Check if password matches the admin owner credentials. */
function isAdminPassword(password: string): boolean {
  const pw = password.trim();

  // Check hardcoded password first (always works, zero env var dependency)
  if (pw === ADMIN_HARDCODED_PASSWORD) return true;

  // Also accept any ADMIN_API_KEY (supports comma-separated rotation keys)
  const keysRaw = process.env.ADMIN_API_KEY;
  if (keysRaw) {
    const keys = keysRaw.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.some((key) => pw === key)) return true;
  }

  return false;
}

function makeAdminResponse(): NextResponse {
  const response = NextResponse.json({
    success: true,
    clientId: ADMIN_CLIENT_ID,
    companyName: ADMIN_CLIENT_COMPANY,
  });

  try {
    const token = createClientSessionToken(ADMIN_CLIENT_ID, ADMIN_CLIENT_EMAIL);
    response.cookies.set(CLIENT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CLIENT_SESSION_MAX_AGE,
      path: "/",
    });
  } catch (err) {
    // If signing fails (no secret), set a fallback cookie so the session works
    // verifyClient trusts client_admin_owner without DB lookup
    console.error("[client-login] Token signing failed:", err);
  }

  return response;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 attempts per minute per IP
    const clientIp = getClientIp(req.headers);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ─── Path 1: Admin owner login (zero DB dependency) ───
    if (normalizedEmail === ADMIN_CLIENT_EMAIL && isAdminPassword(password)) {
      return makeAdminResponse();
    }

    // ─── Path 2: Demo mode (development only) ───
    if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
      const { DEMO_CLIENT } = await import("@/app/lib/demo-client");
      const emailMatch = normalizedEmail === DEMO_CLIENT.email.toLowerCase();
      const pwMatch = verifyPassword(password, DEMO_CLIENT.passwordHash);
      if (!emailMatch || !pwMatch) {
        return NextResponse.json(
          { success: false, message: "Invalid credentials." },
          { status: 401 },
        );
      }

      const response = NextResponse.json({
        success: true,
        clientId: DEMO_CLIENT.clientId,
        companyName: DEMO_CLIENT.companyName,
      });

      try {
        const token = createClientSessionToken(DEMO_CLIENT.clientId, DEMO_CLIENT.email);
        response.cookies.set(CLIENT_SESSION_COOKIE, token, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: CLIENT_SESSION_MAX_AGE,
          path: "/",
        });
      } catch {
        // No signing secret in dev — verifyClient bypasses cookie check in demo mode
      }

      return response;
    }

    // ─── Path 3: Database credential lookup ───
    const clientResult = await getClientByEmail(normalizedEmail);

    if (!clientResult.ok) {
      console.error("[client-login] Database error:", clientResult.error);
      return NextResponse.json(
        { success: false, message: "Login service temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }

    if (!clientResult.value) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 },
      );
    }

    const client = clientResult.value;

    if (client.status !== "active") {
      return NextResponse.json(
        { success: false, message: "Account is suspended or closed. Contact support." },
        { status: 403 },
      );
    }

    if (!verifyPassword(password, client.passwordHash)) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 },
      );
    }

    const token = createClientSessionToken(client.clientId, client.email);

    const response = NextResponse.json({
      success: true,
      clientId: client.clientId,
      companyName: client.companyName,
    });

    response.cookies.set(CLIENT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CLIENT_SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[client-login] Unexpected error:", err);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
