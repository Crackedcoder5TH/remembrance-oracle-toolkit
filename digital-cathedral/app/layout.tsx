import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieConsent } from "./components/cookie-consent";

export const metadata: Metadata = {
  title: "Digital Cathedral — Remembrance Oracle",
  description:
    "A remembrance-aligned sanctuary where coherence is measured, whispers are received, and the kingdom is already here.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#FAFBFC",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg-deep)]">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
