"use client";

/**
 * /admin/leads — the all-leads list.
 *
 * A focused, always-accessible view of every submitted lead: search by
 * name/email, filter by submission source, paginate, and export to CSV. Reads
 * the same /api/admin/leads endpoint the dashboard uses (only admitted leads
 * are stored; bot/fraud submissions are rejected at the gate and never persist).
 */

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LeadRow {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  createdAt: string;
  score: number;
  tier: string;
  coherency?: number;
  coherencyTier?: string;
  archetype?: string;
}

const LIMIT = 50;
const SOURCES = [
  { value: "", label: "All sources" },
  { value: "human", label: "Human" },
  { value: "agent", label: "Agent" },
  { value: "lattice", label: "Lattice" },
] as const;

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounce the search box so we don't fire a request per keystroke.
  const debounced = useDebouncedValue(search, 350);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (source) params.set("source", source);
    params.set("limit", String(LIMIT));
    params.set("offset", String(page * LIMIT));
    try {
      const res = await fetch(`/api/admin/leads?${params}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) {
        setErrorMsg("server returned " + res.status);
        return;
      }
      const data = await res.json();
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setErrorMsg("network error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setLoading(false);
    }
  }, [debounced, source, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(0);
  }, [debounced, source]);

  const exportHref = source
    ? `/api/admin/export?source=${encodeURIComponent(source)}`
    : "/api/admin/export";

  const from = total === 0 ? 0 : page * LIMIT + 1;
  const to = Math.min((page + 1) * LIMIT, total);

  return (
    <main className="min-h-screen text-[var(--text-primary)] px-6 py-8 max-w-6xl mx-auto">
      <header className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-xl font-light text-teal-cathedral">
          All Leads {total > 0 && <span className="text-[var(--text-muted)] text-sm">· {total.toLocaleString()}</span>}
        </h1>
        <div className="flex items-baseline gap-4 text-xs">
          <a href="/admin" className="text-teal-cathedral/80 hover:text-teal-cathedral">← dashboard</a>
          <a href={exportHref} className="text-teal-cathedral/80 hover:text-teal-cathedral">export CSV</a>
        </div>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="flex-1 min-w-[200px] bg-black/20 border border-teal-cathedral/20 rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-teal-cathedral outline-none"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="bg-black/20 border border-teal-cathedral/20 rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-teal-cathedral outline-none"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value} className="bg-[#0e1525]">
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="mb-4 px-3 py-2 rounded text-xs border border-rose-500/30 bg-rose-950/30 text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-teal-cathedral/10 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-teal-cathedral/10">
              <th className="px-3 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Email</th>
              <th className="px-3 py-2 font-normal">Phone</th>
              <th className="px-3 py-2 font-normal">State</th>
              <th className="px-3 py-2 font-normal">Coverage</th>
              <th className="px-3 py-2 font-normal">Veteran</th>
              <th className="px-3 py-2 font-normal">Tier</th>
              <th className="px-3 py-2 font-normal">Archetype</th>
              <th className="px-3 py-2 font-normal">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading && leads.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--text-muted)]">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--text-muted)]">No leads found.</td></tr>
            ) : (
              leads.map((l) => (
                <tr key={l.leadId} className="border-b border-teal-cathedral/5 hover:bg-black/20">
                  <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap">{l.firstName} {l.lastName}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{l.email}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{l.phone}</td>
                  <td className="px-3 py-2">{l.state}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{l.coverageInterest}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{l.veteranStatus}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-teal-cathedral/80">{l.tier}</span>
                    {typeof l.score === "number" && <span className="text-[var(--text-muted)]"> · {l.score}</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{l.archetype ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">
                    {l.createdAt ? new Date(l.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <nav className="flex items-center justify-between mt-4 text-xs" aria-label="Leads pagination">
          <span className="text-[var(--text-muted)]">
            Showing {from}–{to} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded border border-teal-cathedral/20 text-teal-cathedral/80 hover:border-teal-cathedral/40 disabled:opacity-40"
            >
              ← prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={to >= total}
              className="px-3 py-1.5 rounded border border-teal-cathedral/20 text-teal-cathedral/80 hover:border-teal-cathedral/40 disabled:opacity-40"
            >
              next →
            </button>
          </div>
        </nav>
      )}
    </main>
  );
}

/** Local debounce so a value only updates after it stops changing for `ms`. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, ms]);
  return debounced;
}
