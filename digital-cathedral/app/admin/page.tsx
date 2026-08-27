"use client";

/**
 * /admin — Content / Campaigns.
 *
 * Protected by middleware (session cookie required — see /admin/login).
 *
 * The content-and-campaigns surface: editable homepage message + site images,
 * lead velocity at a glance, service/coverage/source breakdowns, and a
 * filterable lead table with CSV export. Rendered inside the shared PortalShell
 * so it matches the rest of the admin portal; navigation lives in the sidebar.
 *
 * Features:
 *  - Editable homepage story + site image uploads
 *  - Lead stats overview (total, today, week, month)
 *  - Filterable lead table (state, coverage, status, source, search)
 *  - Lead scoring with tier badges (hot/warm/standard/cool)
 *  - CSV export, pagination, real-time SSE notifications
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "../../packages/shared/src/validate-state";
import { CoherencyPulse } from "../components/coherency-pulse";
import { MetricCard, Panel, PortalShell } from "../components/portal-shell";

// --- Debounce hook ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

interface LeadRow {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
  score: number;
  tier: "hot" | "warm" | "standard" | "cool";
  scoreFactors: Record<string, number>;
  /** Covenant-gate coherency. Present for leads admitted via the new path. */
  coherency?: number;
  coherencyTier?: string;
  archetype?: string;
  shape?: number[];
}

interface Stats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  byState: Record<string, number>;
  byCoverage: Record<string, number>;
  byVeteranStatus: Record<string, number>;
  bySource?: { human: number; agent: number; lattice: number };
}

const TIER_STYLES: Record<string, string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-amber-50 text-amber-700 border-amber-200",
  standard: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cool: "bg-sky-50 text-sky-700 border-sky-200",
};

const COVERAGE_LABELS: Record<string, string> = {
  "mortgage-protection": "Term Life",
  "income-replacement": "Term Life",
  "final-expense": "Whole Life (Final Expense)",
  "legacy": "Whole Life",
  "retirement-savings": "IUL",
  "guaranteed-income": "Annuity",
  "not-sure": "Undecided",
};

const inputCls =
  "rounded-lg border border-[#e2d9c9] bg-white px-3 py-2 text-sm text-[#211d18] placeholder:text-[#8a8175] outline-none focus:border-[#c9a75f]";
const th = "px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[#776e61]";
const td = "border-t border-[#eee7da] px-3 py-3 text-sm align-middle";

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterState, setFilterState] = useState("");
  const [filterCoverage, setFilterCoverage] = useState("");
  const [filterVeteran, setFilterVeteran] = useState("");
  const [filterSource, setFilterSource] = useState<"" | "human" | "agent" | "lattice">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(0);
  const LIMIT = 25;

  const fetchStats = useCallback(async () => {
    const leadRes = await fetch("/api/admin/stats");
    if (leadRes.status === 401 || leadRes.status === 403) {
      router.push("/admin/login");
      return;
    }
    if (leadRes.ok) {
      const data = await leadRes.json();
      setStats(data.stats);
    }
  }, [router]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
    if (filterSource) params.set("source", filterSource);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("limit", String(LIMIT));
    params.set("offset", String(page * LIMIT));

    const res = await fetch(`/api/admin/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
    }
    setLoading(false);
  }, [filterState, filterCoverage, filterVeteran, filterSource, debouncedSearch, page]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
    if (filterSource) params.set("source", filterSource);
    if (search) params.set("search", search);

    fetch(`/api/admin/export?${params}`)
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  // --- Image upload state ---
  const [imageSlots] = useState([
    { slot: "veteran-group", label: "Community Photo", description: "Displayed in the 'About the Mission' section on the homepage" },
    { slot: "logo", label: "Site Logo", description: "Displayed in the navigation bar" },
  ]);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    imageSlots.forEach(({ slot }: { slot: string }) => {
      fetch(`/api/upload?slot=${encodeURIComponent(slot)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.url) setImageUrls((prev: Record<string, string | null>) => ({ ...prev, [slot]: data.url }));
        })
        .catch(() => {});
    });
  }, [imageSlots]);

  async function handleImageUpload(slot: string, file: File) {
    setUploadingSlot(slot);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setUploadMessage({ text: body?.error || "Upload failed", type: "error" });
        return;
      }
      const { url } = await res.json();
      setImageUrls((prev: Record<string, string | null>) => ({ ...prev, [slot]: url }));
      setUploadMessage({ text: `${slot} image uploaded successfully!`, type: "success" });
      setTimeout(() => setUploadMessage(null), 4000);
    } catch {
      setUploadMessage({ text: "Upload failed. Please try again.", type: "error" });
    } finally {
      setUploadingSlot(null);
    }
  }

  // --- Editable homepage story message ---
  const [veteranStory, setVeteranStory] = useState("");
  const [storyLoading, setStoryLoading] = useState(false);
  const [storySaving, setStorySaving] = useState(false);
  const [storyMessage, setStoryMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setStoryLoading(true);
    fetch("/api/admin/site-content")
      .then((res) => res.json())
      .then((data) => {
        if (data.content?.veteranStory) {
          setVeteranStory(data.content.veteranStory);
        }
      })
      .catch(() => {})
      .finally(() => setStoryLoading(false));
  }, []);

  async function handleSaveStory() {
    setStorySaving(true);
    setStoryMessage(null);
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ veteranStory }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStoryMessage({ text: body?.error || "Save failed", type: "error" });
        return;
      }
      setStoryMessage({ text: "Message updated successfully!", type: "success" });
      setTimeout(() => setStoryMessage(null), 4000);
    } catch {
      setStoryMessage({ text: "Save failed. Please try again.", type: "error" });
    } finally {
      setStorySaving(false);
    }
  }

  // --- Real-time notifications via SSE ---
  // The stream must open ONCE per mount. If we depend on fetchStats/fetchLeads
  // (which rebuild every time filters change), we'd close and re-open the
  // EventSource on every keystroke — a reconnect storm. We stash the latest
  // callbacks in a ref and read them inside the handler instead.
  const [newLeadFlash, setNewLeadFlash] = useState<string | null>(null);
  const sseHandlersRef = useRef({ fetchStats, fetchLeads });
  useEffect(() => { sseHandlersRef.current = { fetchStats, fetchLeads }; }, [fetchStats, fetchLeads]);

  useEffect(() => {
    // SSE uses cookies automatically — no query param token needed
    const es = new EventSource("/api/admin/events");

    es.addEventListener("lead.created", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setNewLeadFlash(`New lead: ${data.firstName} from ${data.state} (${data.tier})`);
        setTimeout(() => setNewLeadFlash(null), 5000);
        sseHandlersRef.current.fetchStats();
        sseHandlersRef.current.fetchLeads();
      } catch {
        // Ignore parse errors
      }
    });

    es.onerror = () => {
      // Will auto-reconnect via EventSource spec
    };

    return () => es.close();
  }, []);

  // Reset page when debounced search changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchStats();
    fetchLeads();
  }, [fetchStats, fetchLeads]);

  const totalPages = Math.ceil(total / LIMIT);
  const from = total === 0 ? 0 : page * LIMIT + 1;
  const to = Math.min((page + 1) * LIMIT, total);

  return (
    <PortalShell
      role="admin"
      eyebrow="Content / Campaigns"
      title="Content & Campaigns"
      description="Edit the homepage message and site imagery, watch lead velocity, and slice the pipeline by state, coverage, status, and source."
    >
      {/* Real-time notification flash */}
      {newLeadFlash && (
        <div
          className="mb-5 rounded-xl border border-[#176b65]/25 bg-[#176b65]/10 px-4 py-3 text-sm font-medium text-[#176b65]"
          role="status"
          aria-live="polite"
        >
          {newLeadFlash}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="region" aria-label="Lead statistics">
          <MetricCard label="Total Leads" value={stats.total} note="All time" />
          <MetricCard label="Today" value={stats.today} note="Last 24 hours" />
          <MetricCard label="This Week" value={stats.thisWeek} note="Rolling 7 days" />
          <MetricCard label="This Month" value={stats.thisMonth} note="Current month" />
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* Editable Homepage Message */}
        <Panel
          title="Homepage Message"
          action={
            <button
              onClick={handleSaveStory}
              disabled={storySaving || storyLoading}
              className="rounded-lg bg-[#176b65] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12544f] disabled:opacity-50"
            >
              {storySaving ? "Saving…" : "Save Message"}
            </button>
          }
        >
          <p className="mb-4 text-xs text-[#8a8175]">
            Edit the story displayed on the homepage. Use blank lines to separate paragraphs.
          </p>

          {storyMessage && (
            <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${storyMessage.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
              {storyMessage.text}
            </div>
          )}

          {storyLoading ? (
            <div className="py-8 text-center text-sm text-[#8a8175]">Loading message…</div>
          ) : (
            <>
              <textarea
                value={veteranStory}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setVeteranStory(e.target.value)}
                rows={12}
                maxLength={5000}
                className="w-full resize-y rounded-lg border border-[#e2d9c9] bg-white px-4 py-3 font-sans text-sm leading-relaxed text-[#211d18] placeholder:text-[#8a8175] outline-none focus:border-[#c9a75f]"
                placeholder="Enter the homepage story message…"
              />
              <p className="mt-3 text-xs text-[#8a8175]">{veteranStory.length}/5000 characters</p>
            </>
          )}
        </Panel>

        {/* Site Images */}
        <Panel title="Site Images">
          <p className="mb-4 text-xs text-[#8a8175]">Upload or replace images displayed on the website.</p>

          {uploadMessage && (
            <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${uploadMessage.type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
              {uploadMessage.text}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {imageSlots.map(({ slot, label, description }: { slot: string; label: string; description: string }) => (
              <div key={slot} className="rounded-xl border border-[#eee7da] p-4">
                <h3 className="mb-1 text-sm font-semibold text-[#211d18]">{label}</h3>
                <p className="mb-3 text-xs text-[#8a8175]">{description}</p>

                {imageUrls[slot] ? (
                  <img
                    src={imageUrls[slot]!}
                    alt={label}
                    className="mb-3 h-40 w-full rounded-lg bg-[#faf7f0] object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-[#e2d9c9] bg-[#faf7f0]">
                    <span className="text-xs text-[#8a8175]">No image uploaded</span>
                  </div>
                )}

                <input
                  ref={(el: HTMLInputElement | null) => { fileInputRefs.current[slot] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(slot, file);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRefs.current[slot]?.click()}
                  disabled={uploadingSlot === slot}
                  className="w-full rounded-lg bg-[#176b65] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12544f] disabled:opacity-50"
                >
                  {uploadingSlot === slot ? "Uploading…" : imageUrls[slot] ? "Replace Image" : "Upload Image"}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Status + Coverage Breakdown */}
      {stats && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Service Category">
            <div className="space-y-2">
              {Object.entries(stats.byVeteranStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="capitalize text-[#211d18]">{status || "Unknown"}</span>
                  <span className="font-semibold text-[#176b65]">{count}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Coverage Interest">
            <div className="space-y-2">
              {Object.entries(stats.byCoverage).map(([cov, count]) => (
                <div key={cov} className="flex justify-between text-sm">
                  <span className="text-[#211d18]">{COVERAGE_LABELS[cov] || cov}</span>
                  <span className="font-semibold text-[#176b65]">{count}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Source Breakdown — human vs AI agent vs viral-lattice funnel.
          The lattice number can overlap human/agent (it's a separate cut),
          so the percentages are shown against the total, not summed. */}
      {stats?.bySource && (
        <div className="mt-5">
          <Panel title="Submission Source">
            {/* Each card is a filter toggle — click to scope the table to that
                source, click again to clear. Mirrors the Source dropdown below
                (setFilterSource + reset to page 0). */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {([
                { key: "human", label: "Human", value: stats.bySource.human },
                { key: "agent", label: "AI Agent", value: stats.bySource.agent },
                { key: "lattice", label: "Viral Lattice", value: stats.bySource.lattice },
              ] as const).map((s) => {
                const active = filterSource === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    title={active ? `Clear ${s.label} filter` : `Filter the table to ${s.label} leads`}
                    onClick={() => { setFilterSource(active ? "" : s.key); setPage(0); }}
                    className={`rounded-xl border p-3 transition-colors ${active ? "border-[#c9a75f] bg-[#c9a75f]/10" : "border-[#eee7da] hover:bg-[#faf7f0]"}`}
                  >
                    <p className="font-serif text-2xl text-[#176b65]">{s.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-wider text-[#8a8175]">{s.label}</p>
                    <p className="text-[10px] text-[#8a8175]">
                      {stats.total > 0 ? Math.round((100 * s.value) / stats.total) : 0}% of total
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* Lead table + filters */}
      <div className="mt-5">
        <Panel
          title={total > 0 ? `Leads · ${total.toLocaleString()}` : "Leads"}
          action={
            <button onClick={handleExport} className="text-xs font-bold text-[#176b65]">
              Export CSV →
            </button>
          }
        >
          {/* Filters */}
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6" role="search" aria-label="Filter leads">
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); }}
              aria-label="Search leads by name or email"
              className={`${inputCls} col-span-2 md:col-span-1`}
            />
            <select
              value={filterState}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFilterState(e.target.value); setPage(0); }}
              aria-label="Filter by state"
              className={inputCls}
            >
              <option value="">All States</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterCoverage}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFilterCoverage(e.target.value); setPage(0); }}
              aria-label="Filter by coverage type"
              className={inputCls}
            >
              <option value="">All Coverage</option>
              {Object.entries(COVERAGE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={filterVeteran}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFilterVeteran(e.target.value); setPage(0); }}
              aria-label="Filter by service category"
              className={inputCls}
            >
              <option value="">All Status</option>
              <option value="active-duty">Active-Duty</option>
              <option value="reserve">Reserve</option>
              <option value="national-guard">National Guard</option>
              <option value="veteran">Veteran</option>
              <option value="non-military">Civilian</option>
            </select>
            <select
              value={filterSource}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setFilterSource(e.target.value as "" | "human" | "agent" | "lattice");
                setPage(0);
              }}
              aria-label="Filter by submission source"
              className={inputCls}
            >
              <option value="">All Sources</option>
              <option value="human">Human-submitted</option>
              <option value="agent">AI-Agent-submitted</option>
              <option value="lattice">From viral lattice</option>
            </select>
            <button
              onClick={() => { setFilterState(""); setFilterCoverage(""); setFilterVeteran(""); setFilterSource(""); setSearch(""); setPage(0); }}
              className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm text-[#211d18] transition hover:border-[#c9a75f]"
            >
              Clear Filters
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <caption className="sr-only">Insurance leads with scores, contact details, and state information</caption>
              <thead>
                <tr>
                  {["Score", "Name", "Contact", "State", "Coverage", "Status", "Source", "Date"].map((h) => (
                    <th key={h} className={th} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className={`${td} text-center text-[#8a8175]`}>Loading leads…</td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`${td} text-center text-[#8a8175]`}>No leads found.</td>
                  </tr>
                ) : (
                  leads.map((lead: LeadRow) => (
                    <tr key={lead.leadId} className="hover:bg-[#faf7f0]">
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${TIER_STYLES[lead.tier]}`}>
                            {lead.score}
                            <span className="opacity-70">{lead.tier}</span>
                          </span>
                          {lead.shape && lead.shape.length >= 4 ? (
                            <CoherencyPulse
                              shape={lead.shape}
                              score={lead.coherency ?? lead.score / 100}
                              size="sm"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap font-semibold text-[#211d18]`}>
                        {lead.firstName} {lead.lastName}
                      </td>
                      <td className={td}>
                        <div className="text-[#211d18]">{lead.email}</div>
                        <div className="text-xs text-[#8a8175]">{lead.phone}</div>
                      </td>
                      <td className={`${td} text-[#211d18]`}>{lead.state}</td>
                      <td className={`${td} text-[#776e61]`}>
                        {COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest}
                      </td>
                      <td className={td}>
                        {lead.veteranStatus === "non-military" ? (
                          <span className="text-xs text-[#8a8175]">Civilian</span>
                        ) : (
                          <span className="text-xs capitalize text-[#176b65]">
                            {lead.veteranStatus?.replace("-", " ")}{lead.militaryBranch ? ` (${lead.militaryBranch})` : ""}
                          </span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs text-[#8a8175]`}>
                        {lead.utmSource || "direct"}
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs text-[#8a8175]`}>
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Leads pagination">
              <span className="text-[#8a8175]">Showing {from}–{to} of {total.toLocaleString()}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  aria-label="Previous page"
                  className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 text-[#211d18] transition hover:border-[#c9a75f] disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-[#776e61]">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  aria-label="Next page"
                  className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 text-[#211d18] transition hover:border-[#c9a75f] disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </nav>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}
