"use client";

/**
 * Client Portal Login Page
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // In demo mode, auto-login immediately on mount
  useEffect(() => {
    fetch("/api/client/profile").then((res) => {
      if (res.ok) router.push("/portal");
    }).catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/client/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/portal");
      } else {
        setError(data.message || "Login failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="cathedral-surface max-w-sm w-full p-8 rounded-xl">
        <div className="text-center mb-8">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle mb-2">
            Client Portal
          </div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">Sign In</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">Access your lead purchase dashboard</p>
        </div>

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
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
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
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
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
    </main>
  );
}
