import { NextResponse } from "next/server";
import { CLIENT_SESSION_COOKIE } from "@/app/lib/client-auth";

/**
 * Client Logout API
 *
 * POST /api/client/logout — Clear session cookie
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CLIENT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
