"use client";

/**
 * Agent Portal — Welcome Page
 *
 * Landing page for valorlegacies.xyz.
 * Centers a welcome message with login form and quick links.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PortalWelcomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Auto-redirect if already authenticated
  useEffect(() => {
    fetch("/api/portal/session")
      .then((res) => {
        if (res.ok) router.push("/portal/dashboard");
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success || res.ok) {
        router.push("/portal/dashboard");
      } else {
        setError(data.error || data.message || "Login failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-[var(--text-muted)]">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 relative">
      {/* Admin Login — fixed top right, always visible */}
      <div className="fixed top-4 right-4 z-50">
        <Link
          href="/admin/login"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border border-indigo-cathedral/20 bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-teal-cathedral/40 hover:text-teal-cathedral shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.746 3.746 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          Admin Login
        </Link>
      </div>

      <div className="max-w-md w-full space-y-8">
        {/* Welcome Header */}
        <div className="text-center">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle mb-3">
            Valor Legacies
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
            Welcome, Agents
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-sm mx-auto">
            Your trusted partner portal for accessing qualified life insurance leads.
            Sign in to manage your account, browse leads, and grow your business.
          </p>
        </div>

        {/* Login Card */}
        <div className="cathedral-surface p-8 rounded-xl">
          <h2 className="text-lg font-light text-[var(--text-primary)] text-center mb-6">
            Agent Sign In
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral/40 transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral/40 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="cathedral-surface p-4 rounded-lg">
            <div className="text-teal-cathedral mb-2">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Verified Leads</p>
          </div>
          <div className="cathedral-surface p-4 rounded-lg">
            <div className="text-teal-cathedral mb-2">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Real-Time Scoring</p>
          </div>
          <div className="cathedral-surface p-4 rounded-lg">
            <div className="text-teal-cathedral mb-2">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Flexible Pricing</p>
          </div>
        </div>

        {/* ROI Value Proposition */}
        <div className="cathedral-surface p-6 rounded-xl">
          <h3 className="text-sm metallic-gold uppercase tracking-wider mb-4 text-center">Why Agents Choose Valor Legacies</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-3">
              <p className="text-2xl font-bold text-teal-cathedral">Real-Time</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Fresh leads scored and delivered the moment they submit — not aged or recycled</p>
            </div>
            <div className="p-3">
              <p className="text-2xl font-bold text-teal-cathedral">Exclusive Tiers</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Choose your tier — from exclusive (1 buyer) to shared — and only pay for what converts</p>
            </div>
            <div className="p-3">
              <p className="text-2xl font-bold text-teal-cathedral">Track Your ROI</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Built-in conversion tracking shows your real cost-per-sale so you can scale with confidence</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] text-center mt-4 leading-relaxed max-w-lg mx-auto">
            Our agents see their conversion rates directly in the portal. When you know your numbers, you control your growth.
          </p>
        </div>

        {/* Quick Links */}
        <div className="text-center space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Interested in becoming an agent?{" "}
            <a
              href="https://valorlegacies.com/about"
              className="text-teal-cathedral hover:text-teal-cathedral/80 transition-colors"
            >
              Learn more
            </a>
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-muted)]">
            <Link href="/portal/terms" className="hover:text-teal-cathedral transition-colors">
              Terms of Service
            </Link>
            <span className="opacity-30">|</span>
            <Link href="/portal/privacy" className="hover:text-teal-cathedral transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
