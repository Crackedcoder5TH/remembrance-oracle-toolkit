"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /protect now redirects to / (root) — the insurance page is the home page.
 */
export default function ProtectRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-[var(--text-muted)]">Redirecting...</p>
    </main>
  );
}
