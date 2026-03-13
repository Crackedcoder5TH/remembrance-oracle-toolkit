import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Military Family Life Insurance — Coverage Beyond SGLI | Valor Legacies",
  description:
    "Protect your military family with coverage that goes beyond SGLI. Free review in 60 seconds — no obligation, no pressure.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Military Family Life Insurance — Coverage Beyond SGLI",
    description:
      "Protect your military family with coverage that goes beyond SGLI. Free review in 60 seconds.",
  },
};

export default function MilitaryFamilyLPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
