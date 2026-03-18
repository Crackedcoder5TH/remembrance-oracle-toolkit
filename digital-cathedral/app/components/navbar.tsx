"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ImageUpload } from "./image-upload";
import { useIsAdmin } from "../protect/hooks/use-is-admin";

/**
 * Detect if current browser hostname is the portal domain.
 * When NEXT_PUBLIC_PORTAL_URL is set, we compare against it.
 * Returns { isPortal, portalBaseUrl } so links can target the portal domain.
 */
function usePortalDomain(): { isPortal: boolean; portalBaseUrl: string } {
  const [state, setState] = useState<{ isPortal: boolean; portalBaseUrl: string }>({
    isPortal: true, // default true to avoid flash
    portalBaseUrl: "",
  });
  useEffect(() => {
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL;
    if (!portalUrl) {
      setState({ isPortal: true, portalBaseUrl: "" });
      return;
    }
    try {
      const portalHost = new URL(portalUrl).hostname.toLowerCase();
      const isPortal = window.location.hostname.toLowerCase() === portalHost;
      setState({ isPortal, portalBaseUrl: isPortal ? "" : portalUrl.replace(/\/$/, "") });
    } catch {
      setState({ isPortal: true, portalBaseUrl: "" });
    }
  }, []);
  return state;
}

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About Us" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

const PORTAL_NAV_LINKS = [
  { href: "/portal", label: "Home" },
  { href: "/portal/dashboard", label: "Dashboard" },
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

  return (
    <nav className="cathedral-nav w-full text-[var(--text-primary)] relative z-50" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-fib-21 flex items-center justify-between h-fib-55">
        {/* Left: Home dropdown */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="flex items-center gap-fib-8 text-sm font-medium tracking-wide hover:text-[var(--teal)] transition-colors"
          >
            {/* Logo icon — uploadable when admin */}
            <ImageUpload
              slot="logo"
              alt="Valor Legacies logo"
              editable={isAdmin}
              className="shrink-0 w-[26px] h-[26px] rounded overflow-hidden"
              imgClassName="w-full h-full object-contain"
              fallback={
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="nav-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#B8860B" />
                      <stop offset="50%" stopColor="#FFD700" />
                      <stop offset="100%" stopColor="#DAA520" />
                    </linearGradient>
                  </defs>
                  <line x1="24" y1="4" x2="24" y2="10" stroke="#FFD700" strokeWidth="0.7" opacity="0.4" />
                  <line x1="14" y1="7" x2="17" y2="12" stroke="#FFD700" strokeWidth="0.5" opacity="0.3" />
                  <line x1="34" y1="7" x2="31" y2="12" stroke="#FFD700" strokeWidth="0.5" opacity="0.3" />
                  <line x1="8" y1="14" x2="13" y2="16" stroke="#FFD700" strokeWidth="0.5" opacity="0.2" />
                  <line x1="40" y1="14" x2="35" y2="16" stroke="#FFD700" strokeWidth="0.5" opacity="0.2" />
                  <path d="M22 18 Q16 10 6 12 Q4 13 5 15 Q8 16 11 18 Q14 20 18 22 Z" fill="url(#nav-gold)" opacity="0.7" />
                  <path d="M20 20 Q14 14 8 15 Q10 17 14 20 Z" fill="#B8860B" opacity="0.3" />
                  <path d="M26 18 Q32 10 42 12 Q44 13 43 15 Q40 16 37 18 Q34 20 30 22 Z" fill="url(#nav-gold)" opacity="0.7" />
                  <path d="M28 20 Q34 14 40 15 Q38 17 34 20 Z" fill="#B8860B" opacity="0.3" />
                  <path d="M24 38 Q18 32 16 28 Q14 24 16 21 Q18 18 21 19 Q23 20 24 23 Q25 20 27 19 Q30 18 32 21 Q34 24 32 28 Q30 32 24 38 Z" fill="none" stroke="url(#nav-gold)" strokeWidth="1.5" strokeLinejoin="round" />
                  <line x1="24" y1="24" x2="24" y2="30" stroke="#FFD700" strokeWidth="1" opacity="0.8" />
                  <line x1="21.5" y1="26.5" x2="26.5" y2="26.5" stroke="#FFD700" strokeWidth="1" opacity="0.8" />
                </svg>
              }
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
              {(isPortalDomain ? PORTAL_NAV_LINKS : NAV_LINKS).map((link) => (
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

        {/* Right: Auth state */}
        {session?.user ? (
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
            {(Boolean((session.user as Record<string, unknown>).isAdmin) || isPortalDomain) && (
              <a
                href={`${portalBaseUrl}/admin`}
                className="flex items-center gap-fib-5 px-fib-13 py-fib-5 text-xs font-medium rounded-fib border border-[var(--teal)]/30 text-[var(--teal)] hover:border-[var(--teal)] transition-all"
              >
                Admin
              </a>
            )}
            <button
              onClick={() => signOut({ callbackUrl: isPortalDomain ? "/portal" : "/" })}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--teal)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-fib-8">
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
            {isPortalDomain && (
              <Link
                href="/portal/login"
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
                Client Login
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
