/**
 * NextAuth.js v5 — Catch-all API route.
 *
 * Handles all /api/auth/* requests:
 *  - /api/auth/signin
 *  - /api/auth/callback/google
 *  - /api/auth/signout
 *  - /api/auth/session
 *  - /api/auth/csrf
 */

import { handlers } from "@/app/lib/auth-config";

export const { GET, POST } = handlers;
