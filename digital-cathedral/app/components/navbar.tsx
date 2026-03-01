"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/about#how-it-works", label: "How It Works" },
  { href: "/about#who-we-serve", label: "Who We Serve" },
  { href: "/faq", label: "FAQ" },
  { href: "/protect", label: "Get Protected" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function Navbar() {
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
            {/* Heart-hands with angel wings icon */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 48 48"
              fill="none"
              className="shrink-0"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="nav-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#B8860B" />
                  <stop offset="50%" stopColor="#FFD700" />
                  <stop offset="100%" stopColor="#DAA520" />
                </linearGradient>
              </defs>
              {/* Light rays behind */}
              <line x1="24" y1="4" x2="24" y2="10" stroke="#FFD700" strokeWidth="0.7" opacity="0.4" />
              <line x1="14" y1="7" x2="17" y2="12" stroke="#FFD700" strokeWidth="0.5" opacity="0.3" />
              <line x1="34" y1="7" x2="31" y2="12" stroke="#FFD700" strokeWidth="0.5" opacity="0.3" />
              <line x1="8" y1="14" x2="13" y2="16" stroke="#FFD700" strokeWidth="0.5" opacity="0.2" />
              <line x1="40" y1="14" x2="35" y2="16" stroke="#FFD700" strokeWidth="0.5" opacity="0.2" />
              {/* Left wing */}
              <path d="M22 18 Q16 10 6 12 Q4 13 5 15 Q8 16 11 18 Q14 20 18 22 Z" fill="url(#nav-gold)" opacity="0.7" />
              <path d="M20 20 Q14 14 8 15 Q10 17 14 20 Z" fill="#B8860B" opacity="0.3" />
              {/* Right wing */}
              <path d="M26 18 Q32 10 42 12 Q44 13 43 15 Q40 16 37 18 Q34 20 30 22 Z" fill="url(#nav-gold)" opacity="0.7" />
              <path d="M28 20 Q34 14 40 15 Q38 17 34 20 Z" fill="#B8860B" opacity="0.3" />
              {/* Hands forming heart shape */}
              <path d="M24 38 Q18 32 16 28 Q14 24 16 21 Q18 18 21 19 Q23 20 24 23 Q25 20 27 19 Q30 18 32 21 Q34 24 32 28 Q30 32 24 38 Z" fill="none" stroke="url(#nav-gold)" strokeWidth="1.5" strokeLinejoin="round" />
              {/* Small cross at center of heart */}
              <line x1="24" y1="24" x2="24" y2="30" stroke="#FFD700" strokeWidth="1" opacity="0.8" />
              <line x1="21.5" y1="26.5" x2="26.5" y2="26.5" stroke="#FFD700" strokeWidth="1" opacity="0.8" />
            </svg>
            Digital Cathedral
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
              className="absolute left-0 top-full mt-fib-3 w-56 rounded-[13px] py-fib-5 z-50 cathedral-surface"
            >
              {NAV_LINKS.map((link) => (
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

        {/* Right: Login button */}
        <Link
          href="/admin/login"
          className="metallic-gold-btn flex items-center gap-fib-8 px-fib-21 py-fib-8 text-sm font-medium rounded-fib transition-all"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0 metallic-gold-icon"
            aria-hidden="true"
          >
            <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <span className="metallic-gold">Login</span>
        </Link>
      </div>
    </nav>
  );
}
