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
  title: "Your Family Is Already Held in the Light — Veteran Life Insurance",
  description:
    "Veteran-founded life insurance guidance for service members, veterans, and military families. Bridge the SGLI gap with personalized coverage from a licensed professional in your state.",
  openGraph: {
    title: "Your Family Is Already Held in the Light — Digital Cathedral",
    description:
      "Veteran-founded. Remembrance-aligned. Connect with a licensed life insurance professional who understands military life. Term, whole, universal, and final expense options.",
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
