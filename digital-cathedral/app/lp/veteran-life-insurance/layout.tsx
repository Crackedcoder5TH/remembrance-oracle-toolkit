import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Veteran Life Insurance — Free Quote in 60 Seconds | Valor Legacies",
  description:
    "Get a free life insurance coverage review tailored for veterans. No obligation, no pressure. Compare options beyond SGLI/VGLI in under 60 seconds.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Veteran Life Insurance — Free Quote in 60 Seconds",
    description:
      "Get a free life insurance coverage review tailored for veterans. Compare options beyond SGLI/VGLI.",
  },
};

export default function VeteranLPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
