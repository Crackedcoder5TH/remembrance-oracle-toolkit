import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword } from "@/app/lib/client-database";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie.
 * In demo mode (no DATABASE_URL), any credentials succeed — the demo
 * client is auto-authenticated with a proper session cookie.
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

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    // Demo mode — verify against demo client credentials (development only)
    if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
      const { DEMO_CLIENT } = await import("@/app/lib/demo-client");
      const { verifyPassword: verifyPw } = await import("@/app/lib/client-database");
      const emailMatch = email.trim().toLowerCase() === DEMO_CLIENT.email.toLowerCase();
      const pwMatch = verifyPw(password, DEMO_CLIENT.passwordHash);
      if (!emailMatch || !pwMatch) {
        return NextResponse.json(
          { success: false, message: "Invalid credentials." },
          { status: 401 }
        );
      }

      const response = NextResponse.json({
        success: true,
        clientId: DEMO_CLIENT.clientId,
        companyName: DEMO_CLIENT.companyName,
      });

      // Set session cookie even in demo mode so the portal dashboard works
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
        // If no signing secret is configured in dev, still let the login succeed
        // (verifyClient bypasses cookie check in demo mode)
      }

      return response;
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
