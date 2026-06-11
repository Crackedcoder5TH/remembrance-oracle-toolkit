"use client";

/**
 * Agent Portal Registration Page
 *
 * Buyer-side self-serve signup. Matches the existing /portal/login style.
 * POSTs to /api/portal/register; on 200 the API sets the portal session
 * cookie so we can route straight into /portal/dashboard without a
 * second sign-in step.
 *
 * Fields collected (per the API contract in /api/portal/register):
 *   email, password (min 8), firstName, lastName, optional phone, optional state.
 *
 * Inline validation:
 *   - email format (HTML5 type="email" + length sanity)
 *   - password length >= 8
 *   - password === passwordConfirm
 */

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export default function PortalRegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  // Auto-redirect if already authenticated.
  useEffect(() => {
    fetch("/api/portal/session")
      .then((res) => {
        if (res.ok) router.push("/portal/dashboard");
      })
      .catch(() => {});
  }, [router]);

  // Tick down the rate-limit countdown each second.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => {
      setRetryAfter((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  function clientValidate(): string | null {
    if (firstName.trim().length < 1) return "First name is required.";
    if (lastName.trim().length < 1) return "Last name is required.";
    if (!email.includes("@") || email.length < 5) return "Please enter a valid email.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== passwordConfirm) return "Passwords do not match.";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const localErr = clientValidate();
    if (localErr) {
      setError(localErr);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          state: stateCode || undefined,
        }),
      });
      if (res.status === 429) {
        // Honour Retry-After so the user sees a real countdown.
        const header = res.headers.get("Retry-After");
        const seconds = header ? Math.max(1, parseInt(header, 10) || 1) : 60;
        setRetryAfter(seconds);
        const data = await res.json().catch(() => ({}));
        setError(data.error || data.message || "Too many registration attempts.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success === true || data.success === undefined)) {
        // The register API mints the portal session cookie on success,
        // so we can route straight to the dashboard.
        router.push("/portal/dashboard");
      } else if (res.status === 409) {
        setError("An account with this email already exists. Please sign in instead.");
      } else {
        setError(data.error || data.message || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const rateLimited = retryAfter > 0;
  const submitDisabled = loading || rateLimited;
  const submitLabel = loading
    ? "Submitting application..."
    : rateLimited
      ? `Try again in ${retryAfter}s`
      : "Submit application";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="cathedral-surface max-w-md w-full p-8 rounded-xl">
        <div className="text-center mb-8">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle mb-2">
            Agent Portal
          </div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">Become a partner agent</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Licensed insurance professionals only. You can sign in right away;
            your account stays in pending review until our team verifies your
            license — typically one business day. You&apos;ll receive an email
            the moment marketplace access unlocks.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-xs text-[var(--text-muted)] mb-1">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                required
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-xs text-[var(--text-muted)] mb-1">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                required
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-xs text-[var(--text-muted)] mb-1">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="phone" className="block text-xs text-[var(--text-muted)] mb-1">
                Phone <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-xs text-[var(--text-muted)] mb-1">
                License state <span className="text-[var(--text-muted)]">(optional)</span>
              </label>
              <select
                id="state"
                value={stateCode}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStateCode(e.target.value)}
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs text-[var(--text-muted)] mb-1">
              Password <span className="text-[var(--text-muted)]">(min 8 characters)</span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
            />
          </div>

          <div>
            <label
              htmlFor="passwordConfirm"
              className="block text-xs text-[var(--text-muted)] mb-1"
            >
              Confirm password
            </label>
            <input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordConfirm(e.target.value)}
              required
              minLength={8}
              className={
                "w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border rounded-lg px-3 py-2 text-sm focus:outline-none " +
                (passwordConfirm && password !== passwordConfirm
                  ? "border-red-300 focus:border-red-400"
                  : "border-indigo-cathedral/10 focus:border-indigo-cathedral/25")
              }
            />
            {passwordConfirm && password !== passwordConfirm && (
              <p className="mt-1 text-[10px] text-red-600">Passwords do not match.</p>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            By creating an account you agree to the Agent Portal{" "}
            <Link
              href="/portal/terms"
              className="underline hover:text-teal-cathedral"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/portal/privacy"
              className="underline hover:text-teal-cathedral"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </Link>
            . Your license will be verified before any leads are released.
          </p>

          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/portal/login" className="text-teal-cathedral hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
