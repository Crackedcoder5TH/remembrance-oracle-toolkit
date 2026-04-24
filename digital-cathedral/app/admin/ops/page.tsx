"use client";

/**
 * /admin/ops — operational health dashboard.
 *
 * One page of truth for operators. Pulls from /api/admin/ops/summary and
 * renders:
 *   - Readiness verdict (ready / warning / blocked) at the top
 *   - Ledger backend + current-month volume
 *   - Lead velocity (24h / 7d / month)
 *   - Latest diagnostic run — findings by severity + class
 *   - Environment variable readiness — which critical vars are missing
 *
 * Admin-auth enforced by middleware (same as the rest of /admin).
 */

import { useEffect, useState } from "react";

type Readiness = "ready" | "warning" | "blocked";

interface OpsSummary {
  generatedAt: string;
  readiness: Readiness;
  ledger: {
    backend: string;
    location: string;
    currentMonth: { month: string; entries: number; bytes: number };
    totalMonths: number;
    latestEntryObservedAt: string | null;
  };
  velocity: {
    last24h: number;
    last7d: number;
    currentMonth: number;
    totalMonths: number;
  };
  diagnostic: {
    mtime?: string;
    generatedAt?: string;
    filesScanned?: number;
    totalFindings?: number;
    byClass?: Record<string, number>;
    bySeverity?: Record<string, number>;
    note?: string;
  };
  environment: {
    criticalMissing: number;
    critical: { key: string; set: boolean }[];
    features: { key: string; set: boolean }[];
  };
}

const READINESS_STYLE: Record<Readiness, { label: string; dot: string; border: string }> = {
  ready:   { label: "READY",   dot: "bg-teal-cathedral",  border: "border-teal-cathedral/40" },
  warning: { label: "WARNING", dot: "bg-yellow-500",      border: "border-yellow-500/40" },
  blocked: { label: "BLOCKED", dot: "bg-red-500",         border: "border-red-500/40" },
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function OpsPage() {
  const [data, setData] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/ops/summary", { cache: "no-store" });
        if (!res.ok) throw new Error(`failed (${res.status})`);
        const json = (await res.json()) as OpsSummary;
        if (!cancel) setData(json);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancel = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-[var(--text-muted)]">Loading operational snapshot…</p>
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="min-h-screen p-6">
        <h1 className="text-2xl font-light mb-2">Cathedral Operations</h1>
        <p className="text-red-400">Error: {error ?? "no data"}</p>
      </main>
    );
  }

  const style = READINESS_STYLE[data.readiness];
  const diag = data.diagnostic;
  const hasDiagnostic = typeof diag.totalFindings === "number";

  return (
    <main className="min-h-screen p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">Cathedral Operations</h1>
          <p className="text-xs text-[var(--text-muted)] tracking-[0.2em] uppercase mt-1">
            Snapshot &middot; {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${style.border}`}>
          <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
          <span className="text-xs font-medium tracking-[0.2em] text-[var(--text-primary)]">
            {style.label}
          </span>
        </div>
      </header>

      {/* Grid of panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Ledger panel */}
        <section className="cathedral-surface p-4">
          <h2 className="text-sm tracking-[0.2em] uppercase text-teal-cathedral mb-3">Ledger</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Backend</dt><dd className="font-mono">{data.ledger.backend}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">This month</dt><dd>{data.ledger.currentMonth.entries} entries ({fmtBytes(data.ledger.currentMonth.bytes)})</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Total months</dt><dd>{data.ledger.totalMonths}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Latest entry</dt><dd>{timeSince(data.ledger.latestEntryObservedAt)}</dd></div>
          </dl>
        </section>

        {/* Velocity panel */}
        <section className="cathedral-surface p-4">
          <h2 className="text-sm tracking-[0.2em] uppercase text-teal-cathedral mb-3">Velocity</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Last 24h</dt><dd>{data.velocity.last24h}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Last 7d</dt><dd>{data.velocity.last7d}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-muted)]">This month</dt><dd>{data.velocity.currentMonth}</dd></div>
          </dl>
        </section>

        {/* Diagnostic panel */}
        <section className="cathedral-surface p-4">
          <h2 className="text-sm tracking-[0.2em] uppercase text-teal-cathedral mb-3">Diagnostic</h2>
          {hasDiagnostic ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Last run</dt><dd>{timeSince(diag.mtime)}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Files scanned</dt><dd>{diag.filesScanned}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Total findings</dt><dd>{diag.totalFindings}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">High severity</dt><dd className={(diag.bySeverity?.high ?? 0) > 0 ? "text-yellow-400" : ""}>{diag.bySeverity?.high ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Medium</dt><dd>{diag.bySeverity?.medium ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Low</dt><dd>{diag.bySeverity?.low ?? 0}</dd></div>
            </dl>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">{diag.note ?? "no diagnostic data"}</p>
          )}
        </section>

        {/* Env panel — spans the width because it's the longest */}
        <section className="cathedral-surface p-4 md:col-span-2 lg:col-span-3">
          <h2 className="text-sm tracking-[0.2em] uppercase text-teal-cathedral mb-3">Environment</h2>
          {data.environment.criticalMissing > 0 ? (
            <p className="text-xs text-red-400 mb-3">
              {data.environment.criticalMissing} critical env var{data.environment.criticalMissing === 1 ? "" : "s"} missing — production will not run correctly.
            </p>
          ) : (
            <p className="text-xs text-teal-cathedral mb-3">All critical env vars populated.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <h3 className="uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Critical</h3>
              <ul className="space-y-1 font-mono">
                {data.environment.critical.map((e) => (
                  <li key={e.key} className="flex items-center justify-between">
                    <span>{e.key}</span>
                    <span className={e.set ? "text-teal-cathedral" : "text-red-400"}>{e.set ? "set" : "MISSING"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Features</h3>
              <ul className="space-y-1 font-mono">
                {data.environment.features.map((e) => (
                  <li key={e.key} className="flex items-center justify-between">
                    <span>{e.key}</span>
                    <span className={e.set ? "text-teal-cathedral" : "text-[var(--text-muted)]"}>{e.set ? "set" : "unset"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <footer className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] pt-4">
        Auto-refreshes every 30s &middot; cached for no longer than one cycle
      </footer>
    </main>
  );
}
