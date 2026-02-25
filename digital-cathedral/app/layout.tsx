import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieConsent } from "./components/cookie-consent";
import { ErrorReporter } from "./components/error-reporter";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "[Company Name] — Life Insurance Quotes from Licensed Professionals",
    template: "%s — [Company Name]",
  },
  description:
    "Connect with licensed life insurance professionals in your state. Get personalized term, whole, universal, and final expense coverage options — no obligation.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "[Company Name]",
    title: "[Company Name] — Life Insurance Quotes from Licensed Professionals",
    description:
      "Connect with licensed life insurance professionals in your state. Get personalized coverage options — no obligation.",
    url: BASE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "[Company Name] — Life Insurance Coverage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "[Company Name] — Life Insurance Quotes",
    description:
      "Connect with licensed life insurance professionals. Personalized coverage options — no obligation.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#FAFBFC",
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
      name: "[Company Name]",
      url: BASE_URL,
      description:
        "Connect with licensed life insurance professionals in your state.",
    },
    {
      "@type": "Organization",
      name: "[Company Name]",
      url: BASE_URL,
      description:
        "We connect consumers with licensed life insurance professionals. We are not an insurance company, agent, or broker.",
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
