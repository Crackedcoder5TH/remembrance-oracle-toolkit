import { NextRequest, NextResponse } from "next/server";
import { createClient, getClientByEmail, generateClientId } from "@/app/lib/client-database";
import type { ClientRecord } from "@/app/lib/client-database";
import { hashPassword } from "@/app/lib/password";
import {
  createPortalSessionToken,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_MAX_AGE,
} from "@/app/lib/portal-session";
// BUG FIX (agent-R-register): two parallel auth systems coexist —
// /api/portal/* uses __portal_session, while /api/client/* (used by the
// /portal welcome page and /portal/marketplace) uses __client_session.
// A user who registers but only gets __portal_session appears anonymous
// on any /api/client/* surface. Mint BOTH cookies on register so the
// newly-created account is recognized everywhere.
import {
  createClientSessionToken,
  CLIENT_SESSION_COOKIE,
  CLIENT_SESSION_MAX_AGE,
} from "@/app/lib/client-auth";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 registrations per minute per IP
    const clientIp = getClientIp(req.headers);
    const rateCheck = await checkRateLimit(clientIp, 3, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json();
    const { email, password, firstName, lastName, phone, state } = body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Email, password, first name, and last name are required." },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    // Check if account already exists
    const existing = await getClientByEmail(email);
    if (!existing.ok) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }
    if (existing.value) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 409 },
      );
    }

    // Hash password and create client
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const clientId = generateClientId();
    const clientRecord: ClientRecord = {
      clientId,
      companyName: `${firstName.trim()} ${lastName.trim()}`,
      contactName: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim().toLowerCase(),
      phone: (phone || "").trim(),
      passwordHash,
      status: "active",
      pricingTier: "standard",
      pricePerLead: 2500,
      exclusivePrice: 5000,
      stateLicenses: state ? JSON.stringify([state.trim()]) : "[]",
      coverageTypes: "[]",
      dailyCap: 50,
      monthlyCap: 1000,
      minScore: 0,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    };
    const result = await createClient(clientRecord);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Create session and set cookie
    const token = createPortalSessionToken({
      id: parseInt(clientId.replace(/\D/g, "").slice(0, 8) || "0", 10),
      email: email.trim().toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(PORTAL_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: PORTAL_SESSION_MAX_AGE,
      path: "/",
    });

    // BUG FIX (agent-R-register): also mint the __client_session cookie so
    // the freshly-registered account is recognized by /api/client/profile
    // (used by /portal welcome auto-redirect and /portal/marketplace).
    // Without this, a registered user navigating to /portal would be
    // treated as anonymous despite holding a valid __portal_session.
    const clientToken = createClientSessionToken(clientId, clientRecord.email);
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
