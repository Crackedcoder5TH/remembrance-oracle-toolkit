import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword } from "@/app/lib/client-database";
import { createClientSessionToken, CLIENT_SESSION_COOKIE, CLIENT_SESSION_MAX_AGE } from "@/app/lib/client-auth";

/**
 * Client Login API
 *
 * POST /api/client/login — Authenticate client and set session cookie
 *
 * In demo mode (no DATABASE_URL), any credentials succeed — the demo
 * client is automatically authenticated.
 */
export async function POST(req: NextRequest) {
  try {
    // Demo mode — skip credential check, auto-authenticate
    if (!process.env.DATABASE_URL) {
      const { DEMO_CLIENT } = await import("@/app/lib/demo-client");
      const response = NextResponse.json({
        success: true,
        clientId: DEMO_CLIENT.clientId,
        companyName: DEMO_CLIENT.companyName,
      });
      // No cookie needed in demo mode — verifyClient bypasses auth
      return response;
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
