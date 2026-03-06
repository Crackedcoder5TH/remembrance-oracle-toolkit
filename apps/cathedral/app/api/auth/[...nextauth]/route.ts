import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Sanitize NEXTAUTH_URL — take only the first URL if comma-separated
if (process.env.NEXTAUTH_URL?.includes(",")) {
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.split(",")[0].trim();
}

/** Comma-separated list of admin emails (case-insensitive). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.sub;
        (session.user as Record<string, unknown>).isAdmin = token.isAdmin ?? false;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
