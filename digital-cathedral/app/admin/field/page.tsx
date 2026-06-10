"use client";

/**
 * Admin Field — fractal control surface for the cathedral.
 *
 * Renders the data fanned out by /api/admin/field at three reading depths:
 *
 *   L1 — four hero metrics in a single strip (Coherence, Leads this month,
 *        Pending buyers, Readiness verdict). Tells the operator in one
 *        glance whether the site is healthy and where the queues are.
 *
 *   L2 — breakdown strips for substrate / leads / buyers / operations,
 *        each rendered as a card with the most-actionable counters.
 *
 *   L3 — deep panels for the substrate's top contributors, missing env
 *        vars, and recent ledger entries. Plus a quick-jump grid to every
 *        sub-page that owns a live control surface.
 *
 * Refresh button hits the same endpoint and re-renders. No SSE here —
 * intentionally manual so an operator inspecting one number doesn't have
 * to watch their reading drift mid-thought.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FieldResponse {
  generatedAt: string;
  readiness: "ready" | "warning" | "blocked";
  leadStats: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    byState: Record<string, number>;
    byCoverage: Record<string, number>;
    byVeteranStatus: Record<string, number>;
    bySource?: { human: number; agent: number; lattice: number };
  } | null;
  clientStats: {
    totalClients: number;
    activeClients: number;
    pendingClients: number;
    totalPurchases: number;
    totalRevenue: number;
    revenueThisMonth: number;
    purchasesThisMonth: number;
    disputesOpen: number;
  } | null;
  field:
    | {
        connected: true;
        coherence: number;
        cascadeFactor: number;
        globalEntropy: number;
        updateCount: number;
        distinctSources: number;
        topSources: Array<{ name: string; count: number; lastCoherence: number }>;
      }
    | { connected: false; reason: string };
  ledger: {
    backend: "file" | "blob";
    location: string;
    totalMonths: number;
    currentMonth: { month: string; entries: number; bytes: number };
    latestEntries: Array<{
      leadId: string;
      observedAt: string;
      state: string | null;
      coverageInterest: string | null;
    }>;
  };
  diagnostic: {
    mtime: string;
    generatedAt?: string;
    filesScanned: number;
    totalFindings: number;
    byClass: Record<string, number>;
    bySeverity: Record<string, number>;
  } | null;
  environment: {
    criticalMissing: number;
    critical: Array<{ key: string; set: boolean }>;
    features: Array<{ key: string; set: boolean }>;
  };
}

const READINESS_STYLES: Record<FieldResponse["readiness"], string> = {
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

const SUB_PAGES: Array<{ label: string; path: string; blurb: string }> = [
  { label: "Lead dashboard", path: "/admin", blurb: "Filtered list + source breakdown + export" },
  { label: "Client management", path: "/admin/clients", blurb: "Buyer accounts + license approval" },
  { label: "Pricing", path: "/admin/pricing", blurb: "Per-tier prices + depreciation" },
  { label: "AI agents", path: "/admin/ai-agents", blurb: "Agent API + consent + rate limits" },
  { label: "Messages", path: "/admin/messages", blurb: "Outbound + inbound buyer comms" },
  { label: "Documents", path: "/admin/documents", blurb: "Per-client policy attachments" },
  { label: "Operations", path: "/admin/ops", blurb: "Ledger + diagnostic + readiness" },
  { label: "Substrate", path: "/admin/substrate", blurb: "Field state + coherency vitals" },
  { label: "Seed test data", path: "/admin/seed", blurb: "Demo leads + demo client" },
];

function fmtMoney(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function fmtBytes(b: number): string {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(2) + " MB";
}

function fmtRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

export default function AdminFieldPage() {
  const [data, setData] = useState<FieldResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchField = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/field");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const payload = (await res.json()) as FieldResponse;
      setData(payload);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load field");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchField();
  }, [fetchField]);

  if (loading && !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Loading field…</p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="cathedral-surface p-6 max-w-md w-full text-center">
          <p className="text-crimson-cathedral text-sm mb-3">{error}</p>
          <button
            onClick={fetchField}
            className="px-3 py-1.5 rounded text-xs bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const heroLeadsMonth = data.leadStats?.thisMonth ?? 0;
  const heroPending = data.clientStats?.pendingClients ?? 0;
  const heroCoherence = data.field.connected ? data.field.coherence : null;
  const totalLeads = data.leadStats?.total ?? 0;
  const bySource = data.leadStats?.bySource ?? { human: 0, agent: 0, lattice: 0 };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase mb-1">
              Cathedral Field
            </div>
            <h1 className="text-2xl font-light text-[var(--text-primary)]">
              Fractal control surface
            </h1>
          </div>
          <div className="flex gap-2 items-center">
            <Link
              href="/admin"
              className="text-xs text-teal-cathedral underline"
            >
              ← Admin home
            </Link>
            <button
              onClick={fetchField}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* L1 — Hero metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="cathedral-surface p-4">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Field coherence
            </p>
            <p className="text-3xl font-light text-teal-cathedral mt-2">
              {heroCoherence !== null ? heroCoherence.toFixed(3) : "—"}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {data.field.connected
                ? `cascade ×${data.field.cascadeFactor.toFixed(2)}`
                : "substrate disconnected"}
            </p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Leads this month
            </p>
            <p className="text-3xl font-light text-teal-cathedral mt-2">{heroLeadsMonth}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {totalLeads} total · {data.leadStats?.today ?? 0} today
            </p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Pending buyers
            </p>
            <p className="text-3xl font-light text-teal-cathedral mt-2">{heroPending}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {data.clientStats?.activeClients ?? 0} active
            </p>
          </div>
          <div className={`p-4 rounded-lg border ${READINESS_STYLES[data.readiness]}`}>
            <p className="text-xs uppercase tracking-wider opacity-80">Readiness</p>
            <p className="text-3xl font-light mt-2 capitalize">{data.readiness}</p>
            <p className="text-[10px] mt-1 opacity-70">
              {data.environment.criticalMissing} critical env missing
            </p>
          </div>
        </div>

        {/* L2 — Source breakdown + Buyer pipeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Lead source split
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-light text-teal-cathedral">{bySource.human}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Human</p>
              </div>
              <div>
                <p className="text-2xl font-light text-teal-cathedral">{bySource.agent}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">AI agent</p>
              </div>
              <div>
                <p className="text-2xl font-light text-teal-cathedral">{bySource.lattice}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Lattice</p>
              </div>
            </div>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Buyer pipeline
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-light text-teal-cathedral">{heroPending}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Pending</p>
              </div>
              <div>
                <p className="text-2xl font-light text-teal-cathedral">
                  {data.clientStats?.activeClients ?? 0}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Active</p>
              </div>
              <div>
                <p className="text-2xl font-light text-teal-cathedral">
                  {data.clientStats?.disputesOpen ?? 0}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Disputes</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-indigo-cathedral/10 text-xs flex justify-between text-[var(--text-muted)]">
              <span>Revenue this month</span>
              <span className="text-teal-cathedral">
                {fmtMoney(data.clientStats?.revenueThisMonth ?? 0)}
              </span>
            </div>
            <div className="text-xs flex justify-between text-[var(--text-muted)] mt-1">
              <span>Purchases this month</span>
              <span className="text-teal-cathedral">
                {data.clientStats?.purchasesThisMonth ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* L2 — Substrate + Ledger */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Substrate field
            </p>
            {data.field.connected ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Coherence</span>
                  <span className="text-teal-cathedral">{data.field.coherence.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Cascade factor</span>
                  <span className="text-teal-cathedral">×{data.field.cascadeFactor.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Global entropy</span>
                  <span className="text-teal-cathedral">{data.field.globalEntropy.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Update count</span>
                  <span className="text-teal-cathedral">{data.field.updateCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Distinct sources</span>
                  <span className="text-teal-cathedral">{data.field.distinctSources}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                {data.field.reason}. Set <code className="text-teal-cathedral">REMEMBRANCE_FIELD_URL</code>{" "}
                + <code className="text-teal-cathedral">REMEMBRANCE_FIELD_TOKEN</code> to connect this
                cathedral to a deployed field server.
              </p>
            )}
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Lead ledger
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Backend</span>
                <span className="text-teal-cathedral capitalize">{data.ledger.backend}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Current month</span>
                <span className="text-teal-cathedral">
                  {data.ledger.currentMonth.entries} entries · {fmtBytes(data.ledger.currentMonth.bytes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Total months</span>
                <span className="text-teal-cathedral">{data.ledger.totalMonths}</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-2 truncate" title={data.ledger.location}>
                {data.ledger.location}
              </div>
            </div>
          </div>
        </div>

        {/* L3 — Top contributors + Missing env */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Top field contributors
            </p>
            {data.field.connected && data.field.topSources.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {data.field.topSources.map((s) => (
                  <div key={s.name} className="flex justify-between gap-2">
                    <span className="text-[var(--text-primary)] truncate" title={s.name}>
                      {s.name}
                    </span>
                    <span className="text-teal-cathedral whitespace-nowrap">
                      {s.count.toLocaleString()} · coh {s.lastCoherence.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                No contributors visible — substrate disconnected.
              </p>
            )}
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Environment readiness
            </p>
            <div className="space-y-1.5 text-xs">
              <p className="text-[var(--text-muted)] mb-1">
                Critical ({data.environment.critical.filter((e) => e.set).length}/
                {data.environment.critical.length} set)
              </p>
              {data.environment.critical.map((e) => (
                <div key={e.key} className="flex justify-between">
                  <span className="text-[var(--text-primary)]">{e.key}</span>
                  <span className={e.set ? "text-emerald-600" : "text-crimson-cathedral"}>
                    {e.set ? "✓ set" : "✗ missing"}
                  </span>
                </div>
              ))}
              <p className="text-[var(--text-muted)] mt-3 mb-1">
                Features ({data.environment.features.filter((e) => e.set).length}/
                {data.environment.features.length} set)
              </p>
              {data.environment.features.map((e) => (
                <div key={e.key} className="flex justify-between">
                  <span className="text-[var(--text-primary)]">{e.key}</span>
                  <span className={e.set ? "text-emerald-600" : "text-[var(--text-muted)]"}>
                    {e.set ? "✓" : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* L3 — Recent ledger entries */}
        {data.ledger.latestEntries.length > 0 && (
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
              Recent ledger entries
            </p>
            <div className="space-y-1.5 text-xs">
              {data.ledger.latestEntries.map((e) => (
                <div key={e.leadId} className="flex justify-between gap-3">
                  <span className="font-mono text-[var(--text-primary)] truncate">{e.leadId}</span>
                  <span className="text-[var(--text-muted)] whitespace-nowrap">
                    {e.state} · {e.coverageInterest} · {fmtRelTime(e.observedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Control surface — direct links into every sub-admin page */}
        <div className="cathedral-surface p-4">
          <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">
            Control surface
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {SUB_PAGES.map((p) => (
              <Link
                key={p.path}
                href={p.path}
                className="block px-3 py-2 rounded border border-indigo-cathedral/10 hover:border-teal-cathedral/40 hover:bg-teal-cathedral/5 transition-colors"
              >
                <p className="text-sm text-[var(--text-primary)]">{p.label}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{p.blurb}</p>
              </Link>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] text-center pt-2">
          Generated {fmtRelTime(data.generatedAt)}
        </p>
      </div>
    </main>
  );
}
