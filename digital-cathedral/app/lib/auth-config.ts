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

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "user";
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
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
    async jwt({ token, account }) {
      // On initial sign-in (account is present), or on every token refresh
      if (token.email) {
        token.role = getRoleForEmail(token.email);
      }
      return token;
    },
    /** Expose role in the client-accessible session object. */
    async session({ session, token }) {
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
