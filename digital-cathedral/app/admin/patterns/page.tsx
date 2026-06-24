"use client";

/**
 * /admin/patterns — the Void Pattern Library.
 *
 * Browse the curated archetype library (the cathedral's local mirror of the
 * void substrate's `group/name` patterns), see how many of your leads resonate
 * with each archetype, and pull/export those leads. The "Backfill" action
 * stamps any DB leads that were never run through the covenant gate so they
 * join the library.
 *
 * All data comes from the lead ledger (the archetype-stamped record), with the
 * Remembrance field's live learned-shapes shown when the oracle is reachable.
 */

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

interface ArchetypeInfo {
  name: string;
  group: "valor" | "fraud" | "bot" | "unknown";
  vector: number[];
  count: number;
}
interface LearnedShape {
  mean: number;
  variance: number;
  n: number;
  source: string;
  learnedAt: string;
}
interface PatternsOverview {
  dimensions: string[];
  thresholds: Record<string, number>;
  archetypes: ArchetypeInfo[];
  totalStamped: number;
  groupTotals: Record<string, number>;
  tierDistribution: Record<string, number>;
  field: { reachable: boolean; learnedShapes: Record<string, LearnedShape[]> | null };
  generatedAt: string;
}
interface LeadRow {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  archetype: string;
  group: string;
  coherency: number;
  tier: string;
  verdict: string;
  observedAt: string;
}

const GROUP_ORDER: Array<ArchetypeInfo["group"]> = ["valor", "fraud", "bot", "unknown"];
const GROUP_LABEL: Record<string, string> = {
  valor: "Valor — leads you want",
  fraud: "Fraud — shapes to reject",
  bot: "Bot — automated / anti-human",
  unknown: "Unclassified",
};

function groupAccent(group: string): string {
  if (group === "valor") return "text-emerald-300 border-emerald-500/30";
  if (group === "fraud") return "text-amber-300 border-amber-500/30";
  if (group === "bot") return "text-rose-300 border-rose-500/30";
  return "text-[var(--text-muted)] border-teal-cathedral/20";
}
function barColor(group: string): string {
  if (group === "valor") return "bg-emerald-400/70";
  if (group === "fraud") return "bg-amber-400/70";
  if (group === "bot") return "bg-rose-400/70";
  return "bg-teal-cathedral/60";
}

export default function PatternLibraryPage() {
  const [overview, setOverview] = useState<PatternsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const [backfilling, setBackfilling] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchOverview = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/patterns", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        setErrorMsg("server returned " + res.status);
        return;
      }
      setOverview((await res.json()) as PatternsOverview);
    } catch (err) {
      setErrorMsg("network error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const selectArchetype = useCallback(async (name: string) => {
    setSelected(name);
    setLeads(null);
    setLeadsLoading(true);
    try {
      const res = await fetch("/api/admin/patterns/leads?archetype=" + encodeURIComponent(name), {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { leads: LeadRow[] };
        setLeads(data.leads);
      } else {
        setLeads([]);
      }
    } catch {
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  const runBackfill = useCallback(async () => {
    setBackfilling(true);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/patterns/rescore", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        backfilled?: number;
        skipped?: number;
        failed?: number;
        note?: string;
        message?: string;
      };
      if (res.ok && data.success) {
        setFlash({
          ok: true,
          message:
            `Backfill complete — ${data.backfilled ?? 0} stamped, ${data.skipped ?? 0} already in library` +
            (data.failed ? `, ${data.failed} failed` : "") +
            (data.note ? `. ${data.note}` : "."),
        });
        await fetchOverview();
        if (selected) await selectArchetype(selected);
      } else {
        setFlash({ ok: false, message: data.message || "Backfill failed." });
      }
    } catch (err) {
      setFlash({ ok: false, message: "Backfill error: " + (err instanceof Error ? err.message : "unknown") });
    } finally {
      setBackfilling(false);
    }
  }, [fetchOverview, selectArchetype, selected]);

  if (loading && !overview) {
    return <Frame><div className="text-[var(--text-muted)] text-sm">Loading pattern library…</div></Frame>;
  }
  if (errorMsg && !overview) {
    return <Frame><div className="text-rose-400 text-sm">{errorMsg}</div></Frame>;
  }
  if (!overview) return <Frame><div /></Frame>;

  const dims = overview.dimensions;

  return (
    <Frame>
      <header className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
        <h1 className="text-xl font-light text-teal-cathedral">Void Pattern Library</h1>
        <div className="flex items-baseline gap-4 text-xs">
          <button onClick={fetchOverview} className="text-teal-cathedral/80 hover:text-teal-cathedral">
            refresh →
          </button>
          <a
            href="/api/admin/patterns/export"
            className="text-teal-cathedral/80 hover:text-teal-cathedral"
          >
            export all CSV
          </a>
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="px-3 py-1.5 rounded text-xs bg-indigo-cathedral text-white hover:bg-indigo-cathedral/90 disabled:opacity-50"
            title="Stamp DB leads that aren't yet in the library by running them through the covenant gate"
          >
            {backfilling ? "backfilling…" : "Backfill leads"}
          </button>
        </div>
      </header>
      <p className="text-xs text-[var(--text-muted)] mb-6 max-w-3xl">
        Each lead is reduced to a 16-dimension shape and cascaded against these
        archetypes — the strongest resonance is what the lead <em>is</em>. Select
        an archetype to pull the leads that match it. Admission gate ={" "}
        {overview.thresholds.GATE?.toFixed(2)}, foundation ={" "}
        {overview.thresholds.FOUNDATION?.toFixed(2)}.
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

      {/* Summary */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <Card label="Leads stamped" value={overview.totalStamped.toLocaleString()} />
        <Card label="Valor" value={(overview.groupTotals.valor ?? 0).toLocaleString()} />
        <Card label="Fraud" value={(overview.groupTotals.fraud ?? 0).toLocaleString()} />
        <Card label="Bot" value={(overview.groupTotals.bot ?? 0).toLocaleString()} />
        <Card
          label="Oracle field"
          value={overview.field.reachable ? "live" : "offline"}
          sub={overview.field.reachable ? "learned shapes below" : "local only"}
        />
      </section>

      {/* Archetype library, grouped */}
      {GROUP_ORDER.map((group) => {
        const inGroup = overview.archetypes.filter((a) => a.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="mb-8">
            <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">
              {GROUP_LABEL[group]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inGroup.map((a) => (
                <div
                  key={a.name}
                  className={
                    "border rounded-lg p-3 bg-black/10 transition-all " +
                    (selected === a.name ? "border-teal-cathedral" : groupAccent(a.group))
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-light text-[var(--text-primary)] truncate" title={a.name}>
                      {a.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {a.count.toLocaleString()} lead{a.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ShapeBars vector={a.vector} group={a.group} dims={dims} />
                  <div className="flex items-center gap-3 mt-3 text-xs">
                    <button
                      onClick={() => selectArchetype(a.name)}
                      className="text-teal-cathedral/90 hover:text-teal-cathedral"
                    >
                      view leads →
                    </button>
                    <a
                      href={"/api/admin/patterns/export?archetype=" + encodeURIComponent(a.name)}
                      className="text-teal-cathedral/70 hover:text-teal-cathedral"
                    >
                      export CSV
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Selected archetype's leads */}
      {selected && (
        <section className="mb-8" aria-live="polite">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral">
              Leads · {selected}
            </h2>
            <a
              href={"/api/admin/patterns/export?archetype=" + encodeURIComponent(selected)}
              className="text-xs text-teal-cathedral/80 hover:text-teal-cathedral"
            >
              export these →
            </a>
          </div>
          {leadsLoading ? (
            <div className="text-[var(--text-muted)] text-sm">Loading leads…</div>
          ) : !leads || leads.length === 0 ? (
            <div className="text-[var(--text-muted)] text-sm border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
              No leads stamped with this archetype yet. Try{" "}
              <button onClick={runBackfill} className="text-teal-cathedral hover:underline">
                Backfill leads
              </button>{" "}
              to stamp leads that predate the covenant gate.
            </div>
          ) : (
            <div className="overflow-x-auto border border-teal-cathedral/10 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-teal-cathedral/10">
                    <th className="px-3 py-2 font-normal">Name</th>
                    <th className="px-3 py-2 font-normal">Email</th>
                    <th className="px-3 py-2 font-normal">Phone</th>
                    <th className="px-3 py-2 font-normal">State</th>
                    <th className="px-3 py-2 font-normal">Coverage</th>
                    <th className="px-3 py-2 font-normal">Coherency</th>
                    <th className="px-3 py-2 font-normal">Tier</th>
                    <th className="px-3 py-2 font-normal">Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.leadId} className="border-b border-teal-cathedral/5 hover:bg-black/20">
                      <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap">
                        {l.firstName} {l.lastName}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{l.email}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{l.phone}</td>
                      <td className="px-3 py-2">{l.state}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{l.coverageInterest}</td>
                      <td className="px-3 py-2 tabular-nums">{l.coherency.toFixed(3)}</td>
                      <td className="px-3 py-2 text-teal-cathedral/80">{l.tier}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                        {l.observedAt ? new Date(l.observedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Live field learned shapes */}
      <section className="mb-8">
        <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">
          Field learned shapes
        </h2>
        {!overview.field.reachable || !overview.field.learnedShapes ? (
          <div className="text-[var(--text-muted)] text-sm border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
            Oracle field offline — showing the local archetype library only. Start
            the field server to see live learned shapes per domain.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(overview.field.learnedShapes).map(([domain, shapes]) => (
              <div key={domain} className="border border-teal-cathedral/10 rounded-lg p-3 bg-black/10">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-[var(--text-primary)] truncate" title={domain}>
                    {domain}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{shapes.length} shape{shapes.length === 1 ? "" : "s"}</span>
                </div>
                {shapes[0] && (
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    μ {shapes[0].mean.toFixed(3)} · σ² {shapes[0].variance.toFixed(3)} · n {shapes[0].n}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </Frame>
  );
}

/** A compact 16-bar render of an archetype's dimension signature. */
function ShapeBars({
  vector,
  group,
  dims,
}: {
  vector: number[];
  group: string;
  dims: string[];
}) {
  return (
    <div className="flex items-end gap-[2px] h-10 mt-3" aria-hidden="true">
      {vector.map((v, i) => (
        <div
          key={i}
          className={"flex-1 rounded-sm " + barColor(group)}
          style={{ height: `${Math.max(2, Math.min(1, v) * 100)}%` }}
          title={`${dims[i] ?? "dim " + i}: ${v.toFixed(2)}`}
        />
      ))}
    </div>
  );
}

function Frame({ children }: { children?: React.ReactNode }) {
  return (
    <main className="min-h-screen text-[var(--text-primary)] px-6 py-8 max-w-6xl mx-auto">
      {children}
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-teal-cathedral/10 rounded-lg p-3 bg-black/10">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-light text-[var(--text-primary)] mt-1">{value}</div>
      {sub && <div className="text-[10px] uppercase tracking-wider text-teal-cathedral/70 mt-1">{sub}</div>}
    </div>
  );
}
