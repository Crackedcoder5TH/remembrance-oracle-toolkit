"use client";

/**
 * /admin/leads — the all-leads list.
 *
 * A focused, always-accessible view of every submitted lead: search by
 * name/email/phone/id, filter by submission source, paginate, and export to
 * CSV. Reads the same /api/admin/leads endpoint the dashboard uses (only
 * admitted leads are stored; bot/fraud submissions are rejected at the gate and
 * never persist). Rendered inside the shared PortalShell so it matches the rest
 * of the admin portal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PortalShell } from "../../components/portal-shell";

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

const th = "px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[#776e61]";
const td = "border-t border-[#eee7da] px-3 py-3 text-sm align-middle";

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
    <PortalShell
      role="admin"
      eyebrow="Lead center"
      title="All Leads"
      description="Every submitted lead — search, filter by source, and export. Only admitted leads are stored; bot and fraud submissions are rejected at the gate."
    >
      <Panel
        title={total > 0 ? `All leads · ${total.toLocaleString()}` : "All leads"}
        action={<a href={exportHref} className="text-xs font-bold text-[#176b65]">Export CSV →</a>}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, or lead ID…"
            className="min-w-[220px] flex-1 rounded-lg border border-[#e2d9c9] bg-white px-3 py-2 text-sm text-[#211d18] placeholder:text-[#8a8175] outline-none focus:border-[#c9a75f]"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-[#e2d9c9] bg-white px-3 py-2 text-sm text-[#211d18] outline-none focus:border-[#c9a75f]"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {errorMsg && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                {["Name", "State", "Coverage", "Veteran", "Tier", "Archetype", "Submitted", "Consent", "Action"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 ? (
                <tr><td colSpan={9} className={`${td} text-center text-[#8a8175]`}>Loading…</td></tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center">
                    <b className="block text-[#211d18]">No leads have been submitted yet.</b>
                    <span className="mt-1 block text-sm text-[#8a8175]">Once customers complete the Protection Path form, they’ll appear here for review.</span>
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.leadId} className="hover:bg-[#faf7f0]">
                    <td className={`${td} whitespace-nowrap font-semibold text-[#211d18]`}>{l.firstName} {l.lastName}</td>
                    <td className={td}>{l.state}</td>
                    <td className={`${td} text-[#776e61]`}>{l.coverageInterest}</td>
                    <td className={`${td} text-[#776e61]`}>{l.veteranStatus}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="font-semibold text-[#176b65]">{l.tier}</span>
                      {typeof l.score === "number" && <span className="text-[#8a8175]"> · {l.score}</span>}
                    </td>
                    <td className={`${td} text-[#776e61]`}>{l.archetype ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap text-[#776e61]`}>
                      {l.createdAt ? new Date(l.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className={`${td} text-emerald-600`}>Recorded</td>
                    <td className={td}>
                      <a href={`/admin/leads/${l.leadId}`} className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 text-sm text-[#176b65] hover:border-[#c9a75f]">View</a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > LIMIT && (
          <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Leads pagination">
            <span className="text-[#8a8175]">Showing {from}–{to} of {total.toLocaleString()}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 text-[#211d18] hover:border-[#c9a75f] disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={to >= total}
                className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 text-[#211d18] hover:border-[#c9a75f] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </nav>
        )}
      </Panel>
    </PortalShell>
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
