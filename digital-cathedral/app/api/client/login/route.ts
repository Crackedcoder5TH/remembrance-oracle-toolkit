import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword as verifyPasswordHmac } from "@/app/lib/client-database";
import { verifyPassword as verifyPasswordScrypt } from "@/app/lib/password";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie.
 *
 * Auth paths (tried in order):
 *  1. Admin owner login — admin@valorlegacies.xyz with any of the
 *     ADMIN_API_KEY values (comma-separated for key rotation).
 *     Bypasses the database entirely.
 *  2. Database lookup — email + password verified against clients table.
 *  3. Demo mode (no DATABASE_URL, dev only) — demo client credentials.
 *
 * Password verification: this route was previously calling the HMAC
 * verifier from client-database, but accounts created via
 * /api/portal/register are scrypt-hashed (see app/lib/password.ts). To
 * accept both legacy HMAC rows AND new scrypt rows we dispatch on the
 * stored hash format (scrypt hashes have a 64-hex-char salt; HMAC use 32).
 * This mirrors the fix already applied in /api/portal/login/route.ts.
 */

/**
 * Verify a password against a stored hash, supporting both the scrypt
 * format used by /api/portal/register (app/lib/password.ts) and the legacy
 * HMAC format used by client-database/helpers.ts. Returns false for any
 * malformed input — fail closed.
 */
async function verifyClientPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const [salt] = stored.split(":");
  if (!salt) return false;
  // scrypt salt is 32 random bytes → 64 hex chars; HMAC salt is 16 bytes → 32 hex chars.
  if (salt.length === 64) {
    return verifyPasswordScrypt(password, stored);
  }
  return verifyPasswordHmac(password, stored);
}

const ADMIN_CLIENT_ID = "client_admin_owner";
const ADMIN_CLIENT_EMAIL = "admin@valorlegacies.xyz";
const ADMIN_CLIENT_COMPANY = "Valor Legacies (Owner)";
/** Check if password matches the admin owner credentials via ADMIN_API_KEY env var. */
function isAdminPassword(password: string): boolean {
  const pw = password.trim();

  // Accept any ADMIN_API_KEY (supports comma-separated rotation keys)
  const keysRaw = process.env.ADMIN_API_KEY;
  if (!keysRaw) return false;

  const keys = keysRaw.split(",").map((k) => k.trim()).filter(Boolean);
  return keys.some((key) => pw === key);
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
    const rateCheck = await checkRateLimit(clientIp, 5, 60_000);
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
      const pwMatch = await verifyClientPassword(password, DEMO_CLIENT.passwordHash);
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

    if (!(await verifyClientPassword(password, client.passwordHash))) {
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
