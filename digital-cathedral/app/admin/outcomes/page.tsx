"use client";

/**
 * /admin/outcomes — the close-rate feedback loop.
 *
 * Record whether a purchased lead closed (won) or didn't (lost); each outcome is
 * stored as a retro-causal resolved ledger and aggregated into close-rate by
 * coherency band — the proof that the grade predicts closes (and the number that
 * sells the leads).
 */

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

interface Bucket {
  bucket: string;
  won: number;
  lost: number;
  total: number;
  closeRate: number;
  avgPremiumCents: number | null;
}
interface Report {
  buckets: Bucket[];
  totalWon: number;
  totalLost: number;
}

export default function OutcomesPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [leadId, setLeadId] = useState("");
  const [premium, setPremium] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/outcomes", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (res.ok) setReport((await res.json()) as Report);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const record = useCallback(
    async (outcome: "won" | "lost") => {
      const id = leadId.trim();
      if (!id) {
        setFlash({ ok: false, message: "Enter a lead ID first." });
        return;
      }
      setBusy(true);
      setFlash(null);
      try {
        const premiumCents =
          outcome === "won" && premium.trim() ? Math.round(parseFloat(premium) * 100) : undefined;
        const res = await fetch("/api/admin/outcomes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: id, outcome, premiumCents }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setFlash({
            ok: true,
            message: `Recorded ${outcome} for ${id} (coherency ${(data.coherency ?? 0).toFixed(3)}).`,
          });
          setLeadId("");
          setPremium("");
          await load();
        } else {
          setFlash({ ok: false, message: data.message || "Failed to record." });
        }
      } catch (err) {
        setFlash({ ok: false, message: "Error: " + (err instanceof Error ? err.message : "unknown") });
      } finally {
        setBusy(false);
      }
    },
    [leadId, premium, load],
  );

  const overallTotal = (report?.totalWon ?? 0) + (report?.totalLost ?? 0);
  const overallRate = overallTotal > 0 ? (report!.totalWon / overallTotal) : 0;

  return (
    <main className="min-h-screen text-[var(--text-primary)] px-6 py-8 max-w-4xl mx-auto">
      <header className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
        <h1 className="text-xl font-light text-teal-cathedral">Lead Outcomes</h1>
        <div className="flex items-baseline gap-4 text-xs">
          <a href="/admin" className="text-teal-cathedral/80 hover:text-teal-cathedral">← dashboard</a>
          <button onClick={load} className="text-teal-cathedral/80 hover:text-teal-cathedral">refresh →</button>
        </div>
      </header>
      <p className="text-xs text-[var(--text-muted)] mb-6 max-w-2xl">
        Mark whether a purchased lead closed. Each outcome is recorded as the lead&apos;s
        resolved future (a retro-causal ledger), and the table below proves whether
        coherency predicts closes — your pricing tuner and sales deck in one.
      </p>

      {flash && (
        <div
          className={
            "mb-4 px-3 py-2 rounded text-xs " +
            (flash.ok
              ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
              : "border border-rose-500/30 bg-rose-950/30 text-rose-200")
          }
        >
          {flash.message}
        </div>
      )}

      {/* Record an outcome */}
      <section className="border border-teal-cathedral/10 rounded-lg bg-black/10 p-4 mb-8">
        <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">Record an outcome</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Lead ID</span>
            <input
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              placeholder="lead_…"
              className="bg-black/20 border border-teal-cathedral/20 rounded px-3 py-2 text-sm focus:border-teal-cathedral outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 w-40">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Premium $ (if won)</span>
            <input
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              inputMode="decimal"
              placeholder="optional"
              className="bg-black/20 border border-teal-cathedral/20 rounded px-3 py-2 text-sm focus:border-teal-cathedral outline-none"
            />
          </label>
          <button
            onClick={() => record("won")}
            disabled={busy}
            className="px-4 py-2 rounded text-sm bg-emerald-700/80 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Won
          </button>
          <button
            onClick={() => record("lost")}
            disabled={busy}
            className="px-4 py-2 rounded text-sm bg-rose-800/70 text-white hover:bg-rose-800 disabled:opacity-50"
          >
            Lost
          </button>
        </div>
      </section>

      {/* Close-rate by coherency */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral">Close rate by coherency</h2>
          {overallTotal > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              overall {(overallRate * 100).toFixed(0)}% · {report!.totalWon}/{overallTotal} won
            </span>
          )}
        </div>
        {loading ? (
          <div className="text-[var(--text-muted)] text-sm">Loading…</div>
        ) : !report || report.buckets.length === 0 ? (
          <div className="text-[var(--text-muted)] text-sm border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
            No outcomes recorded yet. Mark a few leads won/lost above and the close-rate
            by coherency band will build here.
          </div>
        ) : (
          <div className="overflow-x-auto border border-teal-cathedral/10 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-teal-cathedral/10">
                  <th className="px-3 py-2 font-normal">Coherency band</th>
                  <th className="px-3 py-2 font-normal">Won</th>
                  <th className="px-3 py-2 font-normal">Lost</th>
                  <th className="px-3 py-2 font-normal">Close rate</th>
                  <th className="px-3 py-2 font-normal">Avg premium</th>
                </tr>
              </thead>
              <tbody>
                {report.buckets.map((b) => (
                  <tr key={b.bucket} className="border-b border-teal-cathedral/5">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{b.bucket}</td>
                    <td className="px-3 py-2 text-emerald-300">{b.won}</td>
                    <td className="px-3 py-2 text-rose-300">{b.lost}</td>
                    <td className="px-3 py-2 tabular-nums text-teal-cathedral">
                      {(b.closeRate * 100).toFixed(0)}%
                      <span className="text-[var(--text-muted)]"> ({b.won}/{b.total})</span>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {b.avgPremiumCents != null ? `$${(b.avgPremiumCents / 100).toFixed(0)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
