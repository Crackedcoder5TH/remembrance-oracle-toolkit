"use client";

/**
 * Admin Dashboard
 *
 * Protected by middleware (session cookie required — see /admin/login).
 *
 * Features:
 *  - Lead stats overview (total, today, week, month)
 *  - Filterable lead table (state, coverage, veteran, search)
 *  - Lead scoring with tier badges (hot/warm/standard/cool)
 *  - CSV export
 *  - Pagination
 *  - Real-time SSE notifications
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "../../packages/shared/src/validate-state";

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
}

interface Stats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  byState: Record<string, number>;
  byCoverage: Record<string, number>;
  byVeteranStatus: Record<string, number>;
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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [page, setPage] = useState(0);
  const LIMIT = 25;

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.status === 401 || res.status === 403) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  }, [router]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
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
  }, [filterState, filterCoverage, filterVeteran, debouncedSearch, page]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
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

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  // --- Image upload state ---
  const [imageSlots] = useState([
    { slot: "veteran-group", label: "Veteran Group Photo", description: "Displayed in the 'About the Mission' section on the homepage" },
    { slot: "logo", label: "Site Logo", description: "Displayed in the navigation bar" },
  ]);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    imageSlots.forEach(({ slot }) => {
      fetch(`/api/upload?slot=${encodeURIComponent(slot)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.url) setImageUrls((prev) => ({ ...prev, [slot]: data.url }));
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
      setImageUrls((prev) => ({ ...prev, [slot]: url }));
      setUploadMessage({ text: `${slot} image uploaded successfully!`, type: "success" });
      setTimeout(() => setUploadMessage(null), 4000);
    } catch {
      setUploadMessage({ text: "Upload failed. Please try again.", type: "error" });
    } finally {
      setUploadingSlot(null);
    }
  }

  // --- Real-time notifications via SSE ---
  const [newLeadFlash, setNewLeadFlash] = useState<string | null>(null);
  useEffect(() => {
    // SSE uses cookies automatically — no query param token needed
    const es = new EventSource("/api/admin/events");

    es.addEventListener("lead.created", (e) => {
      try {
        const data = JSON.parse(e.data);
        setNewLeadFlash(`New lead: ${data.firstName} from ${data.state} (${data.tier})`);
        setTimeout(() => setNewLeadFlash(null), 5000);
        fetchStats();
        fetchLeads();
      } catch {
        // Ignore parse errors
      }
    });

    es.onerror = () => {
      // Will auto-reconnect via EventSource spec
    };

    return () => es.close();
  }, [fetchStats, fetchLeads]);

  // Reset page when debounced search changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchStats();
    fetchLeads();
  }, [fetchStats, fetchLeads]);

  const totalPages = Math.ceil(total / LIMIT);

  // --- Dashboard ---
  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase pulse-gentle">
            Admin
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">
            Lead Dashboard
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/admin/leads")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Lead Management
          </button>
          <button
            onClick={() => router.push("/admin/clients")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Client Management
          </button>
          <button
            onClick={() => router.push("/admin/pricing")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Pricing
          </button>
          <button
            onClick={() => router.push("/admin/ai-agents")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-indigo-600 text-white hover:bg-indigo-500"
          >
            AI Agents
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all text-teal-cathedral/70 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral"
          >
            Export CSV
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all text-teal-cathedral/70 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Real-time notification flash */}
      {newLeadFlash && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20 animate-in fade-in"
          role="status"
          aria-live="polite"
        >
          {newLeadFlash}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" role="region" aria-label="Lead statistics">
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">Total Leads</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.total}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">Today</p>
            <p className="text-2xl font-light text-teal-cathedral mt-1">{stats.today}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">This Week</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.thisWeek}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">This Month</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.thisMonth}</p>
          </div>
        </div>
      )}

      {/* Site Images */}
      <div className="cathedral-surface p-6 mb-8" role="region" aria-label="Site images">
        <h2 className="text-lg font-light text-[var(--text-primary)] mb-1">Site Images</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Upload or replace images displayed on the website.</p>

        {uploadMessage && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${uploadMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {uploadMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {imageSlots.map(({ slot, label, description }) => (
            <div key={slot} className="border border-indigo-cathedral/10 rounded-lg p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{label}</h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>

              {imageUrls[slot] ? (
                <img
                  src={imageUrls[slot]!}
                  alt={label}
                  className="w-full h-40 object-cover rounded-lg mb-3 bg-[var(--bg-surface)]"
                />
              ) : (
                <div className="w-full h-40 rounded-lg mb-3 bg-[var(--bg-surface)] border border-dashed border-indigo-cathedral/20 flex items-center justify-center">
                  <span className="text-xs text-[var(--text-muted)]">No image uploaded</span>
                </div>
              )}

              <input
                ref={(el) => { fileInputRefs.current[slot] = el; }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(slot, file);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRefs.current[slot]?.click()}
                disabled={uploadingSlot === slot}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50"
              >
                {uploadingSlot === slot ? "Uploading..." : imageUrls[slot] ? "Replace Image" : "Upload Image"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Veteran + Coverage Breakdown */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="cathedral-surface p-4" role="region" aria-label="Service category breakdown">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">Service Category</p>
            <div className="space-y-2">
              {Object.entries(stats.byVeteranStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-[var(--text-primary)] capitalize">{status || "Unknown"}</span>
                  <span className="text-teal-cathedral">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cathedral-surface p-4" role="region" aria-label="Coverage type breakdown">
            <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium mb-3">Coverage Interest</p>
            <div className="space-y-2">
              {Object.entries(stats.byCoverage).map(([cov, count]) => (
                <div key={cov} className="flex justify-between text-sm">
                  <span className="text-[var(--text-primary)]">{COVERAGE_LABELS[cov] || cov}</span>
                  <span className="text-teal-cathedral">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="cathedral-surface p-4 mb-6" role="search" aria-label="Filter leads">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            aria-label="Search leads by name or email"
            className="bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 col-span-2 md:col-span-1"
          />
          <select
            value={filterState}
            onChange={(e) => { setFilterState(e.target.value); setPage(0); }}
            aria-label="Filter by state"
            className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none"
          >
            <option value="">All States</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterCoverage}
            onChange={(e) => { setFilterCoverage(e.target.value); setPage(0); }}
            aria-label="Filter by coverage type"
            className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none"
          >
            <option value="">All Coverage</option>
            {Object.entries(COVERAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={filterVeteran}
            onChange={(e) => { setFilterVeteran(e.target.value); setPage(0); }}
            aria-label="Filter by service category"
            className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none"
          >
            <option value="">All Military Status</option>
            <option value="active-duty">Active-Duty</option>
            <option value="reserve">Reserve</option>
            <option value="national-guard">National Guard</option>
            <option value="veteran">Veteran</option>
            <option value="non-military">Non-Military</option>
          </select>
          <button
            onClick={() => { setFilterState(""); setFilterCoverage(""); setFilterVeteran(""); setSearch(""); setPage(0); }}
            className="text-sm text-teal-cathedral underline py-2"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Lead Table */}
      <div className="cathedral-surface overflow-x-auto" role="region" aria-label="Leads table">
        <table className="w-full text-sm">
          <caption className="sr-only">Insurance leads with scores, contact details, and state information</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
              <th className="px-4 py-3" scope="col">Score</th>
              <th className="px-4 py-3" scope="col">Name</th>
              <th className="px-4 py-3" scope="col">Contact</th>
              <th className="px-4 py-3" scope="col">State</th>
              <th className="px-4 py-3" scope="col">Coverage</th>
              <th className="px-4 py-3" scope="col">Status</th>
              <th className="px-4 py-3" scope="col">Source</th>
              <th className="px-4 py-3" scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No leads found.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.leadId}
                  className="border-b border-indigo-cathedral/5 hover:bg-[var(--bg-surface)]/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${TIER_STYLES[lead.tier]}`}>
                      {lead.score}
                      <span className="opacity-70">{lead.tier}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">
                    {lead.firstName} {lead.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[var(--text-primary)]">{lead.email}</div>
                    <div className="text-[var(--text-muted)] text-xs">{lead.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{lead.state}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest}
                  </td>
                  <td className="px-4 py-3">
                    {lead.veteranStatus === "non-military" ? (
                      <span className="text-[var(--text-muted)] text-xs">Non-Military</span>
                    ) : (
                      <span className="text-teal-cathedral text-xs capitalize">
                        {lead.veteranStatus?.replace("-", " ")}{lead.militaryBranch ? ` (${lead.militaryBranch})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs">
                    {lead.utmSource || "direct"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs whitespace-nowrap">
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
        <nav className="flex items-center justify-between mt-4" aria-label="Leads pagination">
          <p className="text-sm text-[var(--text-muted)]">
            Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-[var(--text-primary)]">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </nav>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>Admin Dashboard — Lead data is confidential.</p>
      </footer>
    </main>
  );
}
