"use client";

/**
 * Admin Dashboard — Kingdom Command Center
 *
 * Oracle decision: GENERATE (dashboard-plugin 0.900, auth-plugin 0.840 too distant)
 *
 * Features:
 *  - Bearer token authentication (ADMIN_API_KEY via login prompt)
 *  - Lead stats overview (total, today, week, month)
 *  - Filterable lead table (state, coverage, veteran, search)
 *  - Lead scoring with tier badges (hot/warm/standard/cool)
 *  - CSV export
 *  - Pagination
 */

import { useState, useCallback, useEffect } from "react";

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
  hot: "bg-red-500/20 text-red-400 border-red-500/30",
  warm: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  standard: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  cool: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const COVERAGE_LABELS: Record<string, string> = {
  "term": "Term Life",
  "whole": "Whole Life",
  "universal": "Universal Life",
  "final-expense": "Final Expense",
  "annuity": "Annuity",
  "not-sure": "Undecided",
};

export default function AdminDashboard() {
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterState, setFilterState] = useState("");
  const [filterCoverage, setFilterCoverage] = useState("");
  const [filterVeteran, setFilterVeteran] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 25;

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats", { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  }, [authHeaders]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
    if (search) params.set("search", search);
    params.set("limit", String(LIMIT));
    params.set("offset", String(page * LIMIT));

    const res = await fetch(`/api/admin/leads?${params}`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
    }
    setLoading(false);
  }, [filterState, filterCoverage, filterVeteran, search, page, authHeaders]);

  const handleLogin = async () => {
    setLoginError("");
    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setAuthenticated(true);
    } else {
      setLoginError("Invalid API key. Check your ADMIN_API_KEY.");
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    if (filterVeteran) params.set("veteran", filterVeteran);
    if (search) params.set("search", search);
    // Open in new tab — token sent via header won't work for direct download
    // So we'll use a fetch + blob approach
    fetch(`/api/admin/export?${params}`, { headers: authHeaders() })
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

  useEffect(() => {
    if (authenticated) {
      fetchStats();
      fetchLeads();
    }
  }, [authenticated, fetchStats, fetchLeads]);

  // --- Login Screen ---
  if (!authenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm cathedral-surface p-8 space-y-6">
          <div className="text-center">
            <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
              Kingdom Admin
            </div>
            <h1 className="text-2xl font-light text-[var(--text-primary)]">
              Dashboard Access
            </h1>
          </div>

          <div className="space-y-3">
            <label htmlFor="admin-token" className="block text-sm text-[var(--text-muted)]">
              API Key
            </label>
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Enter ADMIN_API_KEY"
              className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 transition-all"
              aria-describedby={loginError ? "login-error" : undefined}
            />
            {loginError && (
              <p id="login-error" className="text-crimson-cathedral text-xs" role="alert">
                {loginError}
              </p>
            )}
          </div>

          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 hover:bg-teal-cathedral/30"
          >
            Authenticate
          </button>
        </div>
      </main>
    );
  }

  const totalPages = Math.ceil(total / LIMIT);

  // --- Dashboard ---
  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle">
            Kingdom Admin
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">
            Lead Dashboard
          </h1>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30 hover:bg-teal-cathedral/30"
        >
          Export CSV
        </button>
      </header>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" role="region" aria-label="Lead statistics">
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Total Leads</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.total}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Today</p>
            <p className="text-2xl font-light text-teal-cathedral mt-1">{stats.today}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">This Week</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.thisWeek}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">This Month</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.thisMonth}</p>
          </div>
        </div>
      )}

      {/* Veteran + Coverage Breakdown */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="cathedral-surface p-4" role="region" aria-label="Veteran status breakdown">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-3">Veteran Status</p>
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
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider mb-3">Coverage Interest</p>
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
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            aria-label="Search leads by name or email"
            className="bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral/60 col-span-2 md:col-span-1"
          />
          <select
            value={filterState}
            onChange={(e) => { setFilterState(e.target.value); setPage(0); }}
            aria-label="Filter by state"
            className="bg-[var(--bg-deep)] text-[var(--text-primary)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral/60 appearance-none"
          >
            <option value="">All States</option>
            {["TX","FL","CA","NY","PA","OH","IL","GA","NC","VA","NJ","MI","TN","AZ"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterCoverage}
            onChange={(e) => { setFilterCoverage(e.target.value); setPage(0); }}
            aria-label="Filter by coverage type"
            className="bg-[var(--bg-deep)] text-[var(--text-primary)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral/60 appearance-none"
          >
            <option value="">All Coverage</option>
            {Object.entries(COVERAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={filterVeteran}
            onChange={(e) => { setFilterVeteran(e.target.value); setPage(0); }}
            aria-label="Filter by veteran status"
            className="bg-[var(--bg-deep)] text-[var(--text-primary)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral/60 appearance-none"
          >
            <option value="">All Veteran Status</option>
            <option value="veteran">Veteran</option>
            <option value="non-veteran">Non-Veteran</option>
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
        <table className="w-full text-sm" aria-label="Lead records">
          <thead>
            <tr className="text-left text-[var(--text-muted)] text-xs uppercase tracking-wider border-b border-teal-cathedral/10">
              <th className="px-4 py-3" scope="col">Score</th>
              <th className="px-4 py-3" scope="col">Name</th>
              <th className="px-4 py-3" scope="col">Contact</th>
              <th className="px-4 py-3" scope="col">State</th>
              <th className="px-4 py-3" scope="col">Coverage</th>
              <th className="px-4 py-3" scope="col">Veteran</th>
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
                  className="border-b border-teal-cathedral/5 hover:bg-teal-cathedral/5 transition-colors"
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
                    {lead.veteranStatus === "veteran" ? (
                      <span className="text-teal-cathedral text-xs">
                        Veteran{lead.militaryBranch ? ` (${lead.militaryBranch})` : ""}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)] text-xs">Non-Veteran</span>
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
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-teal-cathedral/10 hover:border-teal-cathedral/30 disabled:opacity-30"
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
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-teal-cathedral/10 hover:border-teal-cathedral/30 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </nav>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>Kingdom Admin Dashboard — Lead data is confidential.</p>
      </footer>
    </main>
  );
}
