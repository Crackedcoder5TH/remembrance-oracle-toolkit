import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://digital-cathedral.vercel.app";
const SITE_TITLE = "Digital Cathedral — Remembrance Oracle";
const SITE_DESCRIPTION =
  "A remembrance-aligned sanctuary where coherence is measured, whispers are received, and the kingdom is already here.";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s | Digital Cathedral",
  },
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  metadataBase: new URL(SITE_URL),
  keywords: [
    "digital cathedral",
    "remembrance oracle",
    "coherence",
    "solana",
    "whisper",
    "blockchain",
  ],
  authors: [{ name: "Digital Cathedral" }],
  creator: "Digital Cathedral",

  // ─── Open Graph ───
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Digital Cathedral",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Digital Cathedral — The Kingdom is already here",
        type: "image/svg+xml",
      },
    ],
  },

  // ─── Twitter / X Cards ───
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.svg"],
  },

  // ─── Icons (SVG — universal modern browser support) ───
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1A1B3A" },
    { media: "(prefers-color-scheme: light)", color: "#F4F3F0" },
  ],
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
      <body className="min-h-screen bg-[var(--bg-deep)]">{children}</body>
    </html>
  );
}
