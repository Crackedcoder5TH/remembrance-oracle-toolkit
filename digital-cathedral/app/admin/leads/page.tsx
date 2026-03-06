"use client";

/**
 * Admin Lead Management Page
 *
 * Features:
 *  - Seed test leads (all 4 tiers) for demo/testing
 *  - Seed test client for portal access
 *  - View seeded lead results with tier badges
 *  - Quick link back to dashboard
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIER_STYLES: Record<string, string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-amber-50 text-amber-700 border-amber-200",
  standard: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cool: "bg-sky-50 text-sky-700 border-sky-200",
};

interface SeedResult {
  name: string;
  status: string;
  leadId?: string;
  tier?: string;
  score?: number;
}

interface SeedClientResult {
  message: string;
  credentials?: { email: string; password: string };
  clientId?: string;
  details?: {
    companyName: string;
    balance: string;
    pricePerLead: string;
    exclusivePrice: string;
    licensedStates: number;
  };
}

export default function AdminLeadManagement() {
  const router = useRouter();
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResults, setSeedResults] = useState<SeedResult[] | null>(null);
  const [seedMessage, setSeedMessage] = useState("");
  const [seedDemoMode, setSeedDemoMode] = useState(false);
  const [seedError, setSeedError] = useState("");

  const [clientLoading, setClientLoading] = useState(false);
  const [clientResult, setClientResult] = useState<SeedClientResult | null>(null);
  const [clientError, setClientError] = useState("");

  const handleSeedLeads = async () => {
    setSeedLoading(true);
    setSeedError("");
    setSeedResults(null);
    setSeedMessage("");
    setSeedDemoMode(false);
    try {
      const res = await fetch("/api/admin/seed-lead", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSeedResults(data.leads);
        setSeedMessage(data.message || "");
        setSeedDemoMode(!!data.demoMode);
      } else {
        setSeedError(data.message || "Failed to seed leads.");
      }
    } catch {
      setSeedError("Network error — is the server running?");
    }
    setSeedLoading(false);
  };

  const handleSeedClient = async () => {
    setClientLoading(true);
    setClientError("");
    setClientResult(null);
    try {
      const res = await fetch("/api/admin/seed-client", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setClientResult(data);
      } else {
        setClientError(data.message || "Failed to seed client.");
      }
    } catch {
      setClientError("Network error — is the server running?");
    }
    setClientLoading(false);
  };

  return (
    <main className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle">
            Admin
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">
            Lead Management
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Back to Dashboard
          </button>
          <button
            onClick={() => router.push("/admin/clients")}
            className="px-4 py-2 rounded-lg text-sm transition-all text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25"
          >
            Client Management
          </button>
        </div>
      </header>

      {/* Seed Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Seed Test Leads Card */}
        <div className="cathedral-surface p-6">
          <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
            Seed Test Leads
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Insert 5 realistic test leads spanning all score tiers — hot, warm, standard, and cool.
            Leads appear instantly in the dashboard and client portal.
          </p>
          <button
            onClick={handleSeedLeads}
            disabled={seedLoading}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {seedLoading ? "Seeding..." : "Seed Test Leads"}
          </button>
          {seedError && (
            <p className="mt-3 text-sm text-red-600">{seedError}</p>
          )}
        </div>

        {/* Seed Test Client Card */}
        <div className="cathedral-surface p-6">
          <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
            Seed Test Client
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Create a test buyer client account for the client portal.
            Includes $500 balance and licenses for 10 states.
          </p>
          <button
            onClick={handleSeedClient}
            disabled={clientLoading}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clientLoading ? "Seeding..." : "Seed Test Client"}
          </button>
          {clientError && (
            <p className="mt-3 text-sm text-red-600">{clientError}</p>
          )}
        </div>
      </div>

      {/* Seed Lead Results */}
      {seedResults && (
        <div className="cathedral-surface p-6 mb-6">
          {seedDemoMode && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
              Demo mode — no database connected. Leads are served from built-in demo data.
            </div>
          )}
          {seedMessage && (
            <p className="text-sm text-emerald-600 mb-4">{seedMessage}</p>
          )}
          <h3 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wider mb-4">
            Test Leads
          </h3>
          <div className="space-y-3">
            {seedResults.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-surface)]"
              >
                <div className="flex items-center gap-3">
                  {r.tier && (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${TIER_STYLES[r.tier] || ""}`}>
                      {r.score != null && <span>{r.score}</span>}
                      <span className="opacity-70">{r.tier}</span>
                    </span>
                  )}
                  <span className="text-sm text-[var(--text-primary)]">{r.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {r.leadId && (
                    <span className="text-xs text-[var(--text-muted)] font-mono">{r.leadId}</span>
                  )}
                  <span className={`text-xs font-medium ${r.status === "created" ? "text-emerald-600" : r.status === "already exists" ? "text-amber-600" : "text-red-600"}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            View these leads on the{" "}
            <button onClick={() => router.push("/admin")} className="text-teal-cathedral underline">
              Dashboard
            </button>
            {" "}or test the{" "}
            <button onClick={() => window.open("/portal", "_blank")} className="text-teal-cathedral underline">
              Client Portal
            </button>.
          </p>
        </div>
      )}

      {/* Seed Client Results */}
      {clientResult && (
        <div className="cathedral-surface p-6 mb-6">
          <h3 className="text-sm font-medium text-[var(--text-primary)] uppercase tracking-wider mb-4">
            Test Client Account
          </h3>
          <p className="text-sm text-emerald-600 mb-3">{clientResult.message}</p>
          {clientResult.credentials && (
            <div className="bg-[var(--bg-surface)] rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Email</span>
                <span className="text-[var(--text-primary)] font-mono">{clientResult.credentials.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Password</span>
                <span className="text-[var(--text-primary)] font-mono">{clientResult.credentials.password}</span>
              </div>
              {clientResult.details && (
                <>
                  <div className="border-t border-indigo-cathedral/10 my-2" />
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Company</span>
                    <span className="text-[var(--text-primary)]">{clientResult.details.companyName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Balance</span>
                    <span className="text-emerald-600">{clientResult.details.balance}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Price/Lead</span>
                    <span className="text-[var(--text-primary)]">{clientResult.details.pricePerLead}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Exclusive Price</span>
                    <span className="text-[var(--text-primary)]">{clientResult.details.exclusivePrice}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Log in at the{" "}
            <button onClick={() => window.open("/portal", "_blank")} className="text-teal-cathedral underline">
              Client Portal
            </button>
            {" "}with these credentials to browse and purchase leads.
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>Lead Management — Test data for demo and development purposes.</p>
      </footer>
    </main>
  );
}
