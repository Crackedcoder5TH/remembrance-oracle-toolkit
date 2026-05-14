import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: {
    template: "%s | Valor Legacies Agent Portal",
    default: "Agent Portal | Valor Legacies",
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
