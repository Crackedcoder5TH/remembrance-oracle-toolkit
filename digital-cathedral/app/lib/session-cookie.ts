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

/**
 * Clear several session cookies in one response. The portal and client cookie
 * families are minted together (register + login set BOTH), so logout must
 * clear BOTH — otherwise signing out from the dashboard leaves the client
 * session (which authorizes the purchasing /api/client/* surface) alive, and
 * vice-versa from the marketplace. Clearing a cookie the browser doesn't hold
 * is a harmless no-op, so every logout route can safely clear the full set.
 */
export function clearSessionsResponse(
  specs: Array<{ name: string; sameSite: SessionSameSite }>,
): NextResponse {
  const response = NextResponse.json({ success: true });
  for (const { name, sameSite } of specs) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite,
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

/**
 * Cookie options for a session that lasts until the browser is fully closed,
 * then requires a fresh login. We deliberately omit `maxAge`/`expires` so the
 * browser treats it as a session cookie. The signed token's own `exp` still
 * bounds the absolute server-side lifetime (verified on every request), so a
 * never-closed browser can't hold a session open forever.
 */
export function sessionCookieOptions(sameSite: SessionSameSite) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    path: "/",
  };
}
