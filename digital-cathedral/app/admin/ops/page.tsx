"use client";

/**
 * /admin/ops — operational health dashboard (Settings).
 *
 * One page of truth for operators. Pulls from /api/admin/ops/summary and
 * renders readiness, ledger backend + volume, lead velocity, the latest
 * diagnostic run, and environment-variable readiness. Rendered inside the
 * shared PortalShell so it matches the rest of the admin portal.
 *
 * Admin-auth enforced by middleware (same as the rest of /admin).
 */

import { useEffect, useState } from "react";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";

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
  velocity: { last24h: number; last7d: number; currentMonth: number; totalMonths: number };
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

const READINESS_STYLE: Record<Readiness, { label: string; chip: string; dot: string }> = {
  ready:   { label: "Ready",   chip: "border-emerald-300 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  warning: { label: "Warning", chip: "border-amber-300 bg-amber-50 text-amber-800",       dot: "bg-amber-500" },
  blocked: { label: "Blocked", chip: "border-rose-300 bg-rose-50 text-rose-700",          dot: "bg-rose-500" },
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
  return `${Math.floor(h / 24)}d ago`;
}

const Row = ({ k, v, accent }: { k: string; v: React.ReactNode; accent?: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <dt className="text-[#776e61]">{k}</dt>
    <dd className={accent ?? "text-[#211d18]"}>{v}</dd>
  </div>
);

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

  const shell = (children: React.ReactNode) => (
    <PortalShell role="admin" eyebrow="Settings" title="Cathedral Operations" description="Operational readiness, ledger volume, lead velocity, the latest diagnostic run, and environment-variable health — refreshed every 30 seconds.">
      {children}
    </PortalShell>
  );

  if (loading) return shell(<p className="text-sm text-[#8a8175]">Loading operational snapshot…</p>);
  if (error || !data) return shell(<p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Error: {error ?? "no data"}</p>);

  const style = READINESS_STYLE[data.readiness as Readiness];
  const diag = data.diagnostic;
  const hasDiagnostic = typeof diag.totalFindings === "number";

  return shell(
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] ${style.chip}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />{style.label}
        </span>
        <span className="text-xs uppercase tracking-[0.18em] text-[#8a8175]">Snapshot · {new Date(data.generatedAt).toLocaleTimeString()}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Leads · 24h" value={data.velocity.last24h} note="Last 24 hours" />
        <MetricCard label="Leads · 7d" value={data.velocity.last7d} note="Last 7 days" />
        <MetricCard label="Leads · month" value={data.velocity.currentMonth} note="Current month" />
        <MetricCard label="Env gaps" value={data.environment.criticalMissing} note="Critical vars missing" urgent={data.environment.criticalMissing > 0} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Ledger">
          <dl className="space-y-2">
            <Row k="Backend" v={<span className="font-mono">{data.ledger.backend}</span>} />
            <Row k="This month" v={`${data.ledger.currentMonth.entries} entries (${fmtBytes(data.ledger.currentMonth.bytes)})`} />
            <Row k="Total months" v={data.ledger.totalMonths} />
            <Row k="Latest entry" v={timeSince(data.ledger.latestEntryObservedAt)} />
          </dl>
        </Panel>

        <Panel title="Velocity">
          <dl className="space-y-2">
            <Row k="Last 24h" v={data.velocity.last24h} />
            <Row k="Last 7d" v={data.velocity.last7d} />
            <Row k="This month" v={data.velocity.currentMonth} />
            <Row k="Total months" v={data.velocity.totalMonths} />
          </dl>
        </Panel>

        <Panel title="Diagnostic">
          {hasDiagnostic ? (
            <dl className="space-y-2">
              <Row k="Last run" v={timeSince(diag.mtime)} />
              <Row k="Files scanned" v={diag.filesScanned} />
              <Row k="Total findings" v={diag.totalFindings} />
              <Row k="High severity" v={diag.bySeverity?.high ?? 0} accent={(diag.bySeverity?.high ?? 0) > 0 ? "font-semibold text-amber-700" : undefined} />
              <Row k="Medium" v={diag.bySeverity?.medium ?? 0} />
              <Row k="Low" v={diag.bySeverity?.low ?? 0} />
            </dl>
          ) : (
            <p className="text-sm text-[#8a8175]">{diag.note ?? "No diagnostic data."}</p>
          )}
        </Panel>

        <div className="xl:col-span-3">
          <Panel title="Environment">
            {data.environment.criticalMissing > 0 ? (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {data.environment.criticalMissing} critical env var{data.environment.criticalMissing === 1 ? "" : "s"} missing — production will not run correctly.
              </p>
            ) : (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">All critical env vars populated.</p>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#776e61]">Critical</h3>
                <ul className="space-y-1 font-mono text-xs">
                  {data.environment.critical.map((e) => (
                    <li key={e.key} className="flex items-center justify-between border-b border-[#eee7da] py-1">
                      <span className="text-[#211d18]">{e.key}</span>
                      <span className={e.set ? "text-emerald-600" : "font-bold text-rose-600"}>{e.set ? "set" : "MISSING"}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#776e61]">Features</h3>
                <ul className="space-y-1 font-mono text-xs">
                  {data.environment.features.map((e) => (
                    <li key={e.key} className="flex items-center justify-between border-b border-[#eee7da] py-1">
                      <span className="text-[#211d18]">{e.key}</span>
                      <span className={e.set ? "text-emerald-600" : "text-[#8a8175]"}>{e.set ? "set" : "unset"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-[#8a8175]">Auto-refreshes every 30s · cached for no longer than one cycle</p>
    </>,
  );
}
