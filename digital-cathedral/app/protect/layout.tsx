/**
 * Protect Layout — SEO metadata for the lead capture page.
 *
 * Oracle decision: GENERATE (0.382) — no existing pattern, write new
 *
 * The protect/page.tsx is "use client" and cannot export metadata directly.
 * This server layout provides the metadata for SEO and Open Graph.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get a Free Life Insurance Quote",
  description:
    "Tell us about yourself and a licensed life insurance professional in your state will contact you with personalized coverage options. Free, no obligation.",
  openGraph: {
    title: "Get a Free Life Insurance Quote — [Company Name]",
    description:
      "Connect with a licensed life insurance professional in your state. Term, whole, universal, and final expense options available.",
    url: "/protect",
  },
};

export default function ProtectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
