import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieConsent } from "./components/cookie-consent";
import { ErrorReporter } from "./components/error-reporter";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

const SITE_URL = "https://digital-cathedral.vercel.app";
const SITE_TITLE = "Protect Your Family Beyond Basic Military Coverage | Digital Cathedral";
const SITE_DESCRIPTION =
  "Life insurance options for Active Duty, National Guard, Reserve, and Veterans — made clear and simple. Founded by a Veteran. Built to Serve Military Families.";

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
        alt: "Digital Cathedral — Protect Your Legacy",
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

// JSON-LD structured data for Google rich results
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Digital Cathedral",
      url: BASE_URL,
      description:
        "A remembrance-aligned sanctuary — coherence measured, whispers received.",
    },
    {
      "@type": "Organization",
      name: "Digital Cathedral",
      url: BASE_URL,
      description:
        "A remembrance-aligned sanctuary offering coherence measurement, whisper archive, and life insurance protection services.",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        availableLanguage: "English",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg-deep)]">
        {children}
        <CookieConsent />
        <ErrorReporter />
      </body>
    </html>
  );
}
