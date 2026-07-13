"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useIsAdmin } from "../protect/hooks/use-is-admin";

/**
 * Detect if current browser hostname is the portal domain.
 * When NEXT_PUBLIC_PORTAL_URL is set, we compare against it.
 * Returns { isPortal, portalBaseUrl } so links can target the portal domain.
 */
function usePortalDomain(): { isPortal: boolean; portalBaseUrl: string } {
  const [state, setState] = useState<{ isPortal: boolean; portalBaseUrl: string }>({
    isPortal: false, // consumer site should never flash portal/admin links
    portalBaseUrl: "",
  });
  useEffect(() => {
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL;
    if (!portalUrl) {
      setState({ isPortal: false, portalBaseUrl: "" });
      return;
    }
    try {
      const portalHost = new URL(portalUrl).hostname.toLowerCase();
      const isPortal = window.location.hostname.toLowerCase() === portalHost;
      setState({ isPortal, portalBaseUrl: isPortal ? "" : portalUrl.replace(/\/$/, "") });
    } catch {
      setState({ isPortal: false, portalBaseUrl: "" });
    }
  }, []);
  return state;
}

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#life-chapters", label: "Life Chapters" },
  { href: "/#guides", label: "Guides" },
  { href: "/about", label: "About" },
  { href: "/#protection-path", label: "Get Started" },
  { href: "/#life-events", label: "Life Events" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
  { href: "/#protect-family-form", label: "Contact" },
];

const PORTAL_NAV_LINKS = [
  { href: "/portal", label: "Home" },
  { href: "/portal/marketplace", label: "Leads Marketplace" },
  { href: "/portal/terms", label: "Terms of Service" },
  { href: "/portal/privacy", label: "Privacy Policy" },
];

export function Navbar() {
  const isAdmin = useIsAdmin();
  const { isPortal: isPortalDomain, portalBaseUrl } = usePortalDomain();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  // Admin-aware navigation. useIsAdmin() recognizes BOTH the legacy
  // __admin_session cookie (API-key login) and a Google-OAuth admin (via
  // /api/admin/check) — so a signed-in operator is never shown the logged-out
  // "Admin login" button or bounced to the login form. Their "home" is the
  // dashboard, and the menu still lets them reach the public pages.
  const adminHref = `${portalBaseUrl}/admin`;
  const menuLinks = isAdmin
    ? [
        { href: adminHref, label: "Admin Dashboard" },
        { href: `${portalBaseUrl}/admin/leads`, label: "All Leads" },
        { href: `${portalBaseUrl}/admin/notifications`, label: "Notifications" },
        { href: `${portalBaseUrl}/admin/outcomes`, label: "Outcomes" },
        { href: `${portalBaseUrl}/admin/patterns`, label: "Pattern Library" },
        { href: `${portalBaseUrl}/portal`, label: "Agent Portal" },
        { href: "/", label: "Public Home" },
        { href: "/about", label: "About Us" },
        { href: "/faq", label: "FAQ" },
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms of Service" },
      ]
    : isPortalDomain
      ? PORTAL_NAV_LINKS
      : NAV_LINKS;

  async function handleAdminSignOut() {
    // Clear the admin session cookie, then NextAuth too if a Google session is
    // present, landing back on the login form.
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* best-effort — fall through to the redirect regardless */
    }
    if (session?.user) {
      signOut({ callbackUrl: `${portalBaseUrl}/admin/login` });
    } else {
      window.location.href = `${portalBaseUrl}/admin/login`;
    }
  }

  return (
    <nav className="cathedral-nav w-full text-[var(--text-primary)] relative z-50" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-fib-21 flex items-center justify-between h-fib-55">
        {/* Left: Home dropdown */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setMenuOpen((v: boolean) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="flex items-center gap-fib-8 text-sm font-medium tracking-wide hover:text-[var(--teal)] transition-colors"
          >
            {/* Logo icon — uploadable when admin */}
            <img
              src="/assets/valor/logo.webp"
              alt="Valor Legacies logo"
              className="shrink-0 h-9 w-9 object-contain"
            />
            <span className="text-[var(--teal)]">Valor Legacies</span>
            {/* Chevron */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Main navigation menu"
              className="absolute left-0 top-full mt-fib-3 w-56 rounded-[13px] py-fib-5 z-50 cathedral-surface"
            >
              {menuLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-fib-21 py-fib-8 text-sm text-[var(--text-muted)] hover:text-[var(--teal)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Auth state — admin-aware so a signed-in operator sees their
            dashboard + sign-out, never the "Admin login" button or a bounce
            back to the login form. */}
        {isAdmin ? (
          <div className="flex items-center gap-fib-8">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt={`${session.user.name || "Admin"}'s profile picture`}
                className="w-7 h-7 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="text-sm text-[var(--text-primary)] hidden sm:inline">
              {session?.user?.name?.split(" ")[0] ?? "Admin"}
            </span>
            <a
              href={adminHref}
              className="flex items-center gap-fib-5 px-fib-13 py-fib-5 text-xs font-medium rounded-fib border border-[var(--teal)]/30 text-[var(--teal)] hover:border-[var(--teal)] transition-all"
            >
              Dashboard
            </a>
            <button
              onClick={handleAdminSignOut}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--teal)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : session?.user ? (
          <div className="flex items-center gap-fib-8">
            {session.user.image && (
              <img
                src={session.user.image}
                alt={`${session.user.name || "User"}'s profile picture`}
                className="w-7 h-7 rounded-full"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="text-sm text-[var(--text-primary)] hidden sm:inline">
              {session.user.name?.split(" ")[0]}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: isPortalDomain ? "/portal" : "/" })}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--teal)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-fib-8">
            {isPortalDomain && (
              <a
                href={`${portalBaseUrl}/admin/login`}
                className="flex items-center gap-fib-5 px-fib-13 py-fib-5 text-xs font-medium rounded-fib border border-[var(--teal)]/30 text-[var(--teal)] hover:border-[var(--teal)] transition-all"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Admin
              </a>
            )}
            {isPortalDomain && (
              <Link
                href="/portal"
                className="flex items-center gap-fib-5 px-fib-13 py-fib-5 text-xs font-medium rounded-fib bg-teal-cathedral text-white hover:bg-teal-cathedral/90 transition-all"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Agent Login
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
