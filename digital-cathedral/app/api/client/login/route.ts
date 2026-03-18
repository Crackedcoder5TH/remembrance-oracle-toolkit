import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword, hashPassword } from "@/app/lib/client-database";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie.
 *
 * Auth paths (tried in order):
 *  1. Admin master login — email matches CLIENT_ADMIN_EMAIL (or admin@valorlegacies.xyz)
 *     and password matches ADMIN_API_KEY → instant session, no DB lookup needed.
 *  2. Database lookup — email + password verified against clients table.
 *  3. Demo mode (no DATABASE_URL, dev only) — demo client credentials.
 */

/** Admin client identity used for the master-key login path. */
const ADMIN_CLIENT_ID = "client_admin_owner";
const ADMIN_CLIENT_EMAIL = (process.env.CLIENT_ADMIN_EMAIL ?? "admin@valorlegacies.xyz").trim().toLowerCase();
const ADMIN_CLIENT_COMPANY = "Valor Legacies (Owner)";

function setSessionCookie(
  response: NextResponse,
  clientId: string,
  email: string,
): void {
  const token = createClientSessionToken(clientId, email);
  response.cookies.set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CLIENT_SESSION_MAX_AGE,
    path: "/",
  });
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

    // ─── Path 1: Admin master-key login ───
    // The admin can always log into the client portal using their ADMIN_API_KEY
    // as the password. This bypasses the database entirely — guaranteed to work
    // even if the DB is unreachable, tables are missing, or seed never ran.
    const adminApiKey = (process.env.ADMIN_API_KEY ?? "").trim();
    if (adminApiKey && normalizedEmail === ADMIN_CLIENT_EMAIL && password.trim() === adminApiKey) {
      // Ensure the admin client exists in the database for dashboard queries
      try {
        const existing = await getClientByEmail(ADMIN_CLIENT_EMAIL);
        if (!existing.ok || !existing.value) {
          // Auto-create the admin client row so dashboard/profile pages work
          const { createClient, generateClientId, upsertClientFilters } = await import("@/app/lib/client-database");
          const clientId = generateClientId();
          await createClient({
            clientId,
            companyName: ADMIN_CLIENT_COMPANY,
            contactName: "Admin Owner",
            email: ADMIN_CLIENT_EMAIL,
            phone: "",
            passwordHash: hashPassword(adminApiKey),
            status: "active",
            pricingTier: "enterprise",
            pricePerLead: 0,
            exclusivePrice: 0,
            stateLicenses: JSON.stringify(["TX", "FL", "CA", "NY", "PA", "GA", "NC", "VA", "OH", "IL", "AZ", "CO", "WA", "OR", "NV"]),
            coverageTypes: JSON.stringify(["mortgage-protection", "income-replacement", "final-expense", "legacy", "retirement-savings", "guaranteed-income"]),
            dailyCap: 9999,
            monthlyCap: 99999,
            minScore: 0,
            balance: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          await upsertClientFilters({
            clientId,
            states: JSON.stringify([]),
            coverageTypes: JSON.stringify([]),
            veteranOnly: false,
            minScore: 0,
            maxLeadAge: 72,
            distributionMode: "shared",
          });
        }
      } catch {
        // DB auto-create failed — still allow login; dashboard may show limited data
      }

      const response = NextResponse.json({
        success: true,
        clientId: ADMIN_CLIENT_ID,
        companyName: ADMIN_CLIENT_COMPANY,
      });
      setSessionCookie(response, ADMIN_CLIENT_ID, ADMIN_CLIENT_EMAIL);
      return response;
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
        setSessionCookie(response, DEMO_CLIENT.clientId, DEMO_CLIENT.email);
      } catch {
        // No signing secret in dev — verifyClient bypasses cookie check in demo mode
      }

      return response;
    }

    // ─── Path 3: Database credential lookup ───
    const clientResult = await getClientByEmail(normalizedEmail);

    // Distinguish database errors from "not found"
    if (!clientResult.ok) {
      console.error("[client-login] Database error looking up client:", clientResult.error);
      // If admin email was used but master-key didn't match, hint at the real issue
      if (normalizedEmail === ADMIN_CLIENT_EMAIL) {
        return NextResponse.json(
          { success: false, message: "Database unreachable. For admin access, use your ADMIN_API_KEY as the password." },
          { status: 503 },
        );
      }
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

    const response = NextResponse.json({
      success: true,
      clientId: client.clientId,
      companyName: client.companyName,
    });

    setSessionCookie(response, client.clientId, client.email);
    return response;
  } catch (err) {
    console.error("[client-login] Unexpected error:", err);
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
