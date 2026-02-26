/**
 * CSRF Protection
 *
 * Double-submit cookie pattern:
 *  1. Server sets a random token in an httpOnly, sameSite=strict cookie
 *  2. API endpoint /api/csrf returns the token for the client to read
 *  3. Client sends the token as X-CSRF-Token header on mutating requests
 *  4. Server validates header matches cookie value
 *
 * This works with Next.js App Router + React client components.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const CSRF_COOKIE_NAME = "__csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_LENGTH = 32; // 256 bits of entropy

/** Generate a cryptographically secure CSRF token */
export function generateCsrfToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("hex");
}

/** Read the CSRF token from the request cookie */
export function getCsrfTokenFromCookie(req: NextRequest): string | null {
  return req.cookies.get(CSRF_COOKIE_NAME)?.value ?? null;
}

/** Read the CSRF token from the request header */
export function getCsrfTokenFromHeader(req: NextRequest): string | null {
  return req.headers.get(CSRF_HEADER_NAME);
}

/**
 * Validate that the CSRF header matches the cookie.
 * Returns true if valid, false if mismatch or missing.
 */
export function validateCsrfToken(req: NextRequest): boolean {
  const cookieToken = getCsrfTokenFromCookie(req);
  const headerToken = getCsrfTokenFromHeader(req);

  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  // Constant-time comparison to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Set the CSRF cookie on a response.
 * Call this from the /api/csrf endpoint or middleware.
 */
export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });
}
