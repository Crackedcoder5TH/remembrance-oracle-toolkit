import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/app/lib/admin-session";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

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
    const { key } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { success: false, message: "API key is required." },
        { status: 400 },
      );
    }

    const adminKeysRaw = process.env.ADMIN_API_KEY;
    if (!adminKeysRaw) {
      return NextResponse.json(
        { success: false, message: "Admin access is not configured." },
        { status: 503 },
      );
    }

    // Bug fix: previously compared against the raw env value, which broke during key
    // rotation when ADMIN_API_KEY is set to "current-key,previous-key" — login would
    // try to match the whole comma-joined string. Now split and check each key.
    const adminKeys = adminKeysRaw.split(",").map((k) => k.trim()).filter(Boolean);
    let matched = false;
    for (const adminKey of adminKeys) {
      if (key.length !== adminKey.length) continue;
      let mismatch = 0;
      for (let i = 0; i < key.length; i++) {
        mismatch |= key.charCodeAt(i) ^ adminKey.charCodeAt(i);
      }
      if (mismatch === 0) {
        matched = true;
        // Don't break — keep iterating to preserve constant-time behavior across keys.
      }
    }
    if (!matched) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 403 },
      );
    }

    const token = createSessionToken();
    const response = NextResponse.json({ success: true });

    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request." },
      { status: 400 },
    );
  }
}
