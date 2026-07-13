import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: {
    template: "%s | Valor Legacies Agent & Admin Portal",
    default: "Valor Legacies Agent & Admin Portal",
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
