import type { Metadata, Viewport } from "next";
import { CookieConsent } from "../components/cookie-consent";
import { AnalyticsScripts } from "../components/analytics-scripts";
import { AuthProvider } from "../components/auth-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0F1026" },
    { media: "(prefers-color-scheme: light)", color: "#0F1026" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/**
 * Landing Page Layout — Minimal shell for paid traffic pages.
 *
 * Strips away: Navbar, SacredGeometryBg, footer — zero distractions.
 * Keeps: AuthProvider (session context), CookieConsent (legal), AnalyticsScripts (conversion tracking).
 */
export default function LandingPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[var(--bg-deep)]">
        {children}
      </div>
      <CookieConsent />
      <AnalyticsScripts />
    </AuthProvider>
  );
}
