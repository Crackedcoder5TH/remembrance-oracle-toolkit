"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/admin");
      } else {
        setError(data.message || "Authentication failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase mb-3">
            Admin Gate
          </div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">
            Admin Login
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="cathedral-surface p-6 space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm text-[var(--text-muted)] mb-1"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors"
              placeholder="Enter admin API key"
            />
          </div>

          {error && (
            <p className="text-crimson-cathedral text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Authenticating..." : "Enter"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">
            &larr; Back home
          </a>
        </p>
      </div>
    </main>
  );
}
