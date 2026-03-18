import { NextRequest, NextResponse } from "next/server";
import { getClientByEmail, verifyPassword } from "@/app/lib/client-database";
import {
  createPortalSessionToken,
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_MAX_AGE,
} from "@/app/lib/portal-session";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 attempts per minute per IP
    const clientIp = getClientIp(req.headers);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
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

    const token = createPortalSessionToken({
      id: parseInt(client.clientId.replace(/\D/g, "").slice(0, 8) || "0", 10),
      email: client.email,
      firstName: client.contactName.split(" ")[0] || client.companyName,
      lastName: client.contactName.split(" ").slice(1).join(" ") || "",
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(PORTAL_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: PORTAL_SESSION_MAX_AGE,
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
