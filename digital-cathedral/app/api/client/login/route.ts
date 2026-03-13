import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword } from "@/app/lib/client-database";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie.
 * In demo mode (no DATABASE_URL), any credentials succeed — the demo
 * client is auto-authenticated without cookie or signing secret.
 */
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

    // Demo mode — auto-succeed (development only, never in production)
    if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
      const { DEMO_CLIENT } = await import("@/app/lib/demo-client");
      return NextResponse.json({
        success: true,
        clientId: DEMO_CLIENT.clientId,
        companyName: DEMO_CLIENT.companyName,
      });
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    const clientResult = await getClientByEmail(email.trim().toLowerCase());
    if (!clientResult.ok || !clientResult.value) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const client = clientResult.value;

    if (client.status !== "active") {
      return NextResponse.json(
        { success: false, message: "Account is suspended or closed. Contact support." },
        { status: 403 }
      );
    }

    if (!verifyPassword(password, client.passwordHash)) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
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
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
