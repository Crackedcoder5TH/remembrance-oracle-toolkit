import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/app/lib/admin-session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { key } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { success: false, message: "API key is required." },
        { status: 400 },
      );
    }

    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { success: false, message: "Admin access is not configured." },
        { status: 503 },
      );
    }

    // Constant-time comparison
    if (key.length !== adminKey.length) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 403 },
      );
    }
    let mismatch = 0;
    for (let i = 0; i < key.length; i++) {
      mismatch |= key.charCodeAt(i) ^ adminKey.charCodeAt(i);
    }
    if (mismatch !== 0) {
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
