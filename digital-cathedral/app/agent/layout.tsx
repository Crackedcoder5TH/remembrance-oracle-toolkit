import type { Metadata } from "next";

// Agent operator pages carry no chrome of their own — every page renders inside
// the shared <PortalShell role="agent">, so the sidebar, header and nav live in
// one place (components/portal-shell.tsx) rather than being re-declared here.
// This layout exists only to keep the whole /agent surface out of search
// indexes; the visible operator UI is the shell.
export const metadata: Metadata = {
  title: "Agent Operations",
  robots: { index: false, follow: false },
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
