/**
 * CSRF Token Endpoint.
 *
 * GET /api/csrf → returns a fresh CSRF token and sets it as an httpOnly cookie.
 * The client must send this token as X-CSRF-Token header on mutating requests.
 */

import { NextResponse } from "next/server";
import { generateCsrfToken, setCsrfCookie } from "@/app/lib/csrf";

export async function GET() {
  const token = generateCsrfToken();
  const response = NextResponse.json({ token });
  setCsrfCookie(response, token);
  return response;
}
