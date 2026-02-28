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
    <nav className="w-full bg-navy-cathedral text-white" aria-label="Main navigation">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Left: Home dropdown */}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 text-sm font-medium tracking-wide hover:text-emerald-accent transition-colors"
          >
            {/* Small cathedral icon */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="shrink-0"
              aria-hidden="true"
            >
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
            </svg>
            Digital Cathedral
            {/* Chevron */}
            <svg
              width="12"
              height="12"
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
              className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-navy-cathedral/10 py-2 z-50"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-navy-cathedral hover:bg-soft-gray transition-colors"
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
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-white/20 hover:bg-white/10 transition-all"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0"
            aria-hidden="true"
          >
            <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Login
        </Link>
      </div>
    </nav>
  );
}
