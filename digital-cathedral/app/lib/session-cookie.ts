/**
 * Session cookie helpers — the canonical shape every logout route uses.
 *
 * The three session families (admin, portal, client) each have their own
 * cookie name and sameSite policy (admin + portal are "strict", client is
 * "lax" because the client portal accepts cross-site flows). The clearing
 * mechanics are otherwise identical, so they live here.
 */
import { NextResponse } from "next/server";

export type SessionSameSite = "strict" | "lax";

/**
 * Build a JSON response that clears a session cookie. Use from any logout
 * route: `return clearSessionResponse(COOKIE_NAME, "strict")`.
 */
export function clearSessionResponse(
  cookieName: string,
  sameSite: SessionSameSite,
): NextResponse {
  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    path: "/",
    maxAge: 0,
  });
  return response;
}
