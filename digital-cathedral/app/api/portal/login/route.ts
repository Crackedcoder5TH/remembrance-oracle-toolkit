import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail } from "@/app/lib/client-database";
// Bug fix: register/route.ts hashes with scrypt (app/lib/password.ts) but this
// route previously imported the HMAC verifyPassword from client-database, so
// any account created via /api/portal/register could never log in. Use the
// matching scrypt verifier instead.
import { verifyPassword } from "@/app/lib/password";
import {
  createPortalSessionToken,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_MAX_AGE,
} from "@/app/lib/portal-session";
// Cross-cutting fix (orchestrator, closing the loop after Agents R/S/V):
// the cathedral has two parallel auth surfaces — __portal_session
// (read by /portal/dashboard via /api/portal/session) and __client_session
// (read by /portal/page.tsx + /portal/marketplace via /api/client/*).
// Agent-R already updated /api/portal/register to mint BOTH so a newly-
// registered user is recognized everywhere. This route is the symmetric
// hole: a returning buyer signing in via /portal/login would have
// reached the dashboard but been treated as anonymous on the marketplace.
// Mint both cookies here too so the sign-in result matches the
// register result and the buyer can navigate the full portal.
import {
  createClientSessionToken,
  CLIENT_SESSION_COOKIE,
  CLIENT_SESSION_MAX_AGE,
} from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 attempts per minute per IP
    const clientIp = getClientIp(req.headers);
    const rateCheck = await checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const result = await getClientByEmail(email);
    if (!result.ok) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }

    const client = result.value;
    if (!client) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    if (client.status === "suspended") {
      return NextResponse.json(
        { error: "Your account has been suspended. Please contact support." },
        { status: 403 },
      );
    }

    const valid = await verifyPassword(password, client.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const portalToken = createPortalSessionToken({
      id: parseInt(client.clientId.replace(/\D/g, "").slice(0, 8) || "0", 10),
      email: client.email,
      firstName: client.contactName.split(" ")[0] || client.companyName,
      lastName: client.contactName.split(" ").slice(1).join(" ") || "",
    });

    // Cross-cutting fix (see import block): mint __client_session too so the
    // buyer is recognized on /portal/page.tsx and /portal/marketplace,
    // which read the client-session cookie family.
    const clientToken = createClientSessionToken(client.clientId, client.email);

    const res = NextResponse.json({ success: true });
    res.cookies.set(PORTAL_SESSION_COOKIE, portalToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: PORTAL_SESSION_MAX_AGE,
      path: "/",
    });
    res.cookies.set(CLIENT_SESSION_COOKIE, clientToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: CLIENT_SESSION_MAX_AGE,
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
