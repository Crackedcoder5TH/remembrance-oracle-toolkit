import LoginContent from "./login-content";

/**
 * Consumer login — server-component shell.
 *
 * Reads GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET at request time and passes
 * googleEnabled to the client. When false the Google button is hidden and
 * the user sees a clear "not configured" message instead of clicking
 * through to a NextAuth dead-end. Same pattern as /admin/login.
 */
export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  return <LoginContent googleEnabled={googleEnabled} />;
}
