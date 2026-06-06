/**
 * NextAuth.js v5 Configuration — Google OAuth with role-based admin access.
 *
 * - Google is the sole OAuth provider (primary sign-in method)
 * - JWT strategy: role is embedded in the token at sign-in time
 * - Admin emails are checked server-side via ADMIN_EMAILS env var
 * - After sign-in, a legacy HMAC session cookie is also set for
 *   backward compatibility with existing admin middleware
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getRoleForEmail } from "./admin-emails";

// @ts-expect-error next-auth module not resolvable in this env
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "admin" | "user";
    };
  }
}

// @ts-expect-error next-auth/jwt module not resolvable in this env
declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "user";
  }
}

// H3 fix: only register Google provider when both env vars are present.
// NextAuth v5 evaluates the providers array at module-load. Previously
// the `!` non-null assertions passed `undefined` to the provider in
// missing-env environments, which crashed at /api/auth/session — and
// AuthProvider in app/layout.tsx calls that endpoint on every page load,
// so the entire app surface 500'd on first render when Google wasn't
// configured. Now an unconfigured Google deploy degrades to "API-key
// admin login only" instead of crashing the whole site.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleProvider = googleClientId && googleClientSecret
  ? [Google({ clientId: googleClientId, clientSecret: googleClientSecret })]
  : [];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: googleProvider,
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours — matches existing session duration
  },
  callbacks: {
    /** Inject role into the JWT on first sign-in and on every refresh. */
    async jwt({ token }: { token: Record<string, unknown> & { email?: string; role?: "admin" | "user" }; account?: unknown }) {
      // Bug fix: `account` was destructured but never used — strict TS/ESLint builds
      // (no-unused-vars) would fail. Role is re-derived from email on every refresh.
      if (token.email) {
        token.role = getRoleForEmail(token.email);
      }
      return token;
    },
    /** Expose role in the client-accessible session object. */
    async session({ session, token }: { session: { user?: { role?: "admin" | "user" } & Record<string, unknown> } & Record<string, unknown>; token: { role?: "admin" | "user" } & Record<string, unknown> }) {
      if (session.user) {
        session.user.role = (token.role as "admin" | "user") ?? "user";
      }
      return session;
    },
    /** Control who can sign in — everyone can authenticate, role decides access. */
    async signIn() {
      return true;
    },
  },
});
