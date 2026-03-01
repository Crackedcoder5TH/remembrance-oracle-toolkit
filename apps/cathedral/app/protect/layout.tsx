/**
 * Protect Layout — SEO metadata for the lead capture page.
 *
 * The protect/page.tsx is "use client" and cannot export metadata directly.
 * This server layout provides the metadata for SEO and Open Graph.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protect Your Family Beyond Basic Military Coverage",
  description:
    "Life insurance options for Active Duty, National Guard, Reserve, and Veterans — made clear and simple. Founded by a Veteran. Built to Serve Military Families.",
  openGraph: {
    title: "Protect Your Family Beyond Basic Military Coverage — Valor Legacies",
    description:
      "Veteran-founded. Connect with a licensed life insurance professional who understands military family coverage. Term, whole, universal, and final expense options.",
    url: "/",
  },
};

export default function ProtectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
