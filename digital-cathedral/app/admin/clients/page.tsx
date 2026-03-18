"use client";

/**
 * Admin Client Management Page
 *
 * Features:
 *  - Client overview stats (total, active, revenue, disputes)
 *  - Client list with search and status filter
 *  - Create new client modal
 *  - Client detail view with purchase history
 *  - Revenue breakdown by client
 *  - Dispute management
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "../../../packages/shared/src/validate-state";

const COVERAGE_LABELS: Record<string, string> = {
  "mortgage-protection": "Term Life",
  "income-replacement": "Term Life",
  "final-expense": "Whole Life (Final Expense)",
  "legacy": "Whole Life",
  "retirement-savings": "IUL",
  "guaranteed-income": "Annuity",
  "not-sure": "Undecided",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-red-50 text-red-700 border-red-200",
};

const PURCHASE_STATUS_STYLES: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  disputed: "bg-amber-50 text-amber-700 border-amber-200",
  returned: "bg-red-50 text-red-700 border-red-200",
};

interface ClientRow {
  clientId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  status: string;
  pricingTier: string;
  pricePerLead: number;
  exclusivePrice: number;
  stateLicenses: string;
  coverageTypes: string;
  dailyCap: number;
  monthlyCap: number;
  minScore: number;
  balance: number;
  createdAt: string;
}

interface ClientStats {
  totalClients: number;
  activeClients: number;
  totalPurchases: number;
  totalRevenue: number;
  revenueThisMonth: number;
  purchasesThisMonth: number;
  disputesOpen: number;
}

interface Purchase {
  purchaseId: string;
  leadId: string;
  clientId: string;
  pricePaid: number;
  purchasedAt: string;
  status: string;
  exclusive: boolean;
  returnReason: string;
  returnDeadline: string;
}

interface RevenueEntry {
  clientId: string;
  companyName: string;
  totalRevenue: number;
  totalPurchases: number;
}

type Tab = "clients" | "revenue" | "disputes";

export default function AdminClientsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("clients");
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 25;

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    companyName: "", contactName: "", email: "", phone: "", password: "",
    pricingTier: "standard", pricePerLead: 2500, exclusivePrice: 5000,
    dailyCap: 50, monthlyCap: 1000, minScore: 0, balance: 0,
    stateLicenses: [] as string[], coverageTypes: [] as string[],
  });
  const [createError, setCreateError] = useState("");

  // Detail view
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [clientPurchases, setClientPurchases] = useState<Purchase[]>([]);

  // Revenue
  const [revenueData, setRevenueData] = useState<RevenueEntry[]>([]);

  // Disputes
  const [disputes, setDisputes] = useState<Purchase[]>([]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/revenue");
    if (res.status === 401 || res.status === 403) { router.push("/admin/login"); return; }
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setRevenueData(data.byClient || []);
    }
  }, [router]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (search) params.set("search", search);
    params.set("limit", String(LIMIT));
    params.set("offset", String(page * LIMIT));

    const res = await fetch(`/api/admin/clients?${params}`);
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients);
      setTotalClients(data.total);
    }
    setLoading(false);
  }, [filterStatus, search, page]);

  const fetchDisputes = useCallback(async () => {
    const res = await fetch("/api/admin/disputes");
    if (res.ok) {
      const data = await res.json();
      setDisputes(data.purchases || []);
    }
  }, []);

  const fetchClientDetail = async (clientId: string) => {
    const res = await fetch(`/api/admin/clients/${clientId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedClient(data.client);
      setClientPurchases(data.purchases?.purchases || []);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchClients();
    fetchDisputes();
  }, [fetchStats, fetchClients, fetchDisputes]);

  const handleCreate = async () => {
    setCreateError("");
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setCreateForm({
        companyName: "", contactName: "", email: "", phone: "", password: "",
        pricingTier: "standard", pricePerLead: 2500, exclusivePrice: 5000,
        dailyCap: 50, monthlyCap: 1000, minScore: 0, balance: 0,
        stateLicenses: [], coverageTypes: [],
      });
      fetchClients();
      fetchStats();
    } else {
      setCreateError(data.message || "Failed to create client.");
    }
  };

  const handleDisputeAction = async (purchaseId: string, action: string, clientId: string, refundAmount: number) => {
    await fetch("/api/admin/disputes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseId, action, clientId, refundAmount }),
    });
    fetchDisputes();
    fetchStats();
  };

  const handleUpdateClient = async (clientId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/admin/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchClients();
    fetchStats();
    if (selectedClient?.clientId === clientId) fetchClientDetail(clientId);
  };

  const handleSeedTestClient = async () => {
    const res = await fetch("/api/admin/seed-client", { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await res.json();
    if (data.success) {
      setMessage(`Test client ready! Email: ${data.credentials.email} | Password: ${data.credentials.password}`);
      fetchClients();
      fetchStats();
    } else {
      setMessage(data.message || "Failed to seed test client.");
    }
  };

  const [message, setMessage] = useState("");

  const totalPages = Math.ceil(totalClients / LIMIT);

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle">Admin</div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">Client Management</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSeedTestClient}
            className="px-4 py-2 rounded-lg text-sm transition-all text-[var(--text-muted)] border border-amber-500/30 hover:border-amber-500/60 hover:text-amber-400"
          >
            Seed Test Client
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            + New Client
          </button>
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm transition-all text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25"
          >
            Back to Leads
          </button>
        </div>
      </header>

      {/* Message flash */}
      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20" role="status">
          {message}
          <button onClick={() => setMessage("")} className="float-right text-teal-cathedral/60 hover:text-teal-cathedral">&times;</button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" role="region" aria-label="Client statistics">
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Total Clients</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.totalClients}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Active</p>
            <p className="text-2xl font-light text-teal-cathedral mt-1">{stats.activeClients}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Revenue (Month)</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{formatCents(stats.revenueThisMonth)}</p>
          </div>
          <div className="cathedral-surface p-4">
            <p className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Open Disputes</p>
            <p className="text-2xl font-light text-[var(--text-primary)] mt-1">{stats.disputesOpen}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(["clients", "revenue", "disputes"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm transition-all capitalize ${
              tab === t
                ? "bg-teal-cathedral text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-indigo-cathedral/10"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Clients Tab ─── */}
      {tab === "clients" && (
        <>
          {/* Filters */}
          <div className="cathedral-surface p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Search company, name, or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 col-span-2"
              />
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
              <button
                onClick={() => { setFilterStatus(""); setSearch(""); setPage(0); }}
                className="text-sm text-teal-cathedral underline py-2"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Client Detail Modal */}
          {selectedClient && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="cathedral-surface max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 rounded-xl">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-light text-[var(--text-primary)]">{selectedClient.companyName}</h2>
                    <p className="text-sm text-[var(--text-muted)]">{selectedClient.contactName} &middot; {selectedClient.email}</p>
                  </div>
                  <button onClick={() => setSelectedClient(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">&times;</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Status</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[selectedClient.status]}`}>
                      {selectedClient.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Balance</p>
                    <p className="text-[var(--text-primary)]">{formatCents(selectedClient.balance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Price/Lead</p>
                    <p className="text-[var(--text-primary)]">{formatCents(selectedClient.pricePerLead)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Exclusive Price</p>
                    <p className="text-[var(--text-primary)]">{formatCents(selectedClient.exclusivePrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Daily/Monthly Cap</p>
                    <p className="text-[var(--text-primary)]">{selectedClient.dailyCap} / {selectedClient.monthlyCap}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase">Min Score</p>
                    <p className="text-[var(--text-primary)]">{selectedClient.minScore}</p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 mb-6">
                  {selectedClient.status === "active" && (
                    <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "suspended" })} className="px-3 py-1.5 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">Suspend</button>
                  )}
                  {selectedClient.status === "suspended" && (
                    <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "active" })} className="px-3 py-1.5 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Reactivate</button>
                  )}
                  {selectedClient.status !== "closed" && (
                    <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "closed" })} className="px-3 py-1.5 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200">Close</button>
                  )}
                </div>

                {/* Purchase History */}
                <h3 className="text-sm metallic-gold uppercase tracking-wider mb-3">Purchase History</h3>
                {clientPurchases.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No purchases yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                          <th className="px-3 py-2">Lead</th>
                          <th className="px-3 py-2">Price</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientPurchases.map((p) => (
                          <tr key={p.purchaseId} className="border-b border-indigo-cathedral/5">
                            <td className="px-3 py-2 text-[var(--text-primary)] text-xs font-mono">{p.leadId.slice(0, 16)}...</td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{formatCents(p.pricePaid)}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{p.exclusive ? "Exclusive" : "Shared"}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs border ${PURCHASE_STATUS_STYLES[p.status] || ""}`}>{p.status}</span>
                            </td>
                            <td className="px-3 py-2 text-[var(--text-muted)] text-xs">{new Date(p.purchasedAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Client Table */}
          <div className="cathedral-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Price/Lead</th>
                  <th className="px-4 py-3">Caps (D/M)</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">Loading...</td></tr>
                ) : clients.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">No clients found.</td></tr>
                ) : (
                  clients.map((c) => (
                    <tr
                      key={c.clientId}
                      onClick={() => fetchClientDetail(c.clientId)}
                      className="border-b border-indigo-cathedral/5 hover:bg-[var(--bg-surface)]/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{c.companyName}</td>
                      <td className="px-4 py-3">
                        <div className="text-[var(--text-primary)]">{c.contactName}</div>
                        <div className="text-[var(--text-muted)] text-xs">{c.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] capitalize">{c.pricingTier}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">{formatCents(c.balance)}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{formatCents(c.pricePerLead)}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{c.dailyCap}/{c.monthlyCap}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-between mt-4">
              <p className="text-sm text-[var(--text-muted)]">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, totalClients)} of {totalClients}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25 disabled:opacity-30">Prev</button>
                <span className="px-3 py-1.5 text-sm text-[var(--text-primary)]">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25 disabled:opacity-30">Next</button>
              </div>
            </nav>
          )}
        </>
      )}

      {/* ─── Revenue Tab ─── */}
      {tab === "revenue" && (
        <div className="cathedral-surface overflow-x-auto">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border-b border-indigo-cathedral/10">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Total Revenue</p>
                <p className="text-xl font-light text-[var(--text-primary)]">{formatCents(stats.totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Total Purchases</p>
                <p className="text-xl font-light text-[var(--text-primary)]">{stats.totalPurchases}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">This Month</p>
                <p className="text-xl font-light text-teal-cathedral">{formatCents(stats.revenueThisMonth)} ({stats.purchasesThisMonth} leads)</p>
              </div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Total Revenue</th>
                <th className="px-4 py-3">Leads Purchased</th>
                <th className="px-4 py-3">Avg Cost/Lead</th>
              </tr>
            </thead>
            <tbody>
              {revenueData.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">No revenue data yet.</td></tr>
              ) : (
                revenueData.map((r) => (
                  <tr key={r.clientId} className="border-b border-indigo-cathedral/5">
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{r.companyName}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{formatCents(r.totalRevenue)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.totalPurchases}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.totalPurchases > 0 ? formatCents(Math.round(r.totalRevenue / r.totalPurchases)) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Disputes Tab ─── */}
      {tab === "disputes" && (
        <div className="cathedral-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                <th className="px-4 py-3">Purchase ID</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {disputes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">No open disputes.</td></tr>
              ) : (
                disputes.map((d) => (
                  <tr key={d.purchaseId} className="border-b border-indigo-cathedral/5">
                    <td className="px-4 py-3 text-[var(--text-primary)] text-xs font-mono">{d.purchaseId.slice(0, 20)}...</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs font-mono">{d.leadId.slice(0, 16)}...</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{d.clientId.slice(0, 16)}...</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{formatCents(d.pricePaid)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs max-w-xs truncate">{d.returnReason}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDisputeAction(d.purchaseId, "approve", d.clientId, d.pricePaid)}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDisputeAction(d.purchaseId, "deny", d.clientId, 0)}
                          className="px-2 py-1 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create Client Modal ─── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="cathedral-surface max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 rounded-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-light text-[var(--text-primary)]">Create New Client</h2>
              <button onClick={() => setShowCreate(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">&times;</button>
            </div>

            {createError && <p className="text-red-500 text-sm mb-4">{createError}</p>}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Company Name *</label>
                  <input type="text" value={createForm.companyName} onChange={(e) => setCreateForm({ ...createForm, companyName: e.target.value })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Contact Name *</label>
                  <input type="text" value={createForm.contactName} onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Email *</label>
                  <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Phone</label>
                  <input type="tel" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Password *</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Pricing Tier</label>
                  <select value={createForm.pricingTier} onChange={(e) => setCreateForm({ ...createForm, pricingTier: e.target.value })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none">
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Price/Lead (cents)</label>
                  <input type="number" value={createForm.pricePerLead} onChange={(e) => setCreateForm({ ...createForm, pricePerLead: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Exclusive Price (cents)</label>
                  <input type="number" value={createForm.exclusivePrice} onChange={(e) => setCreateForm({ ...createForm, exclusivePrice: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Daily Cap</label>
                  <input type="number" value={createForm.dailyCap} onChange={(e) => setCreateForm({ ...createForm, dailyCap: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Monthly Cap</label>
                  <input type="number" value={createForm.monthlyCap} onChange={(e) => setCreateForm({ ...createForm, monthlyCap: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Min Score</label>
                  <input type="number" value={createForm.minScore} onChange={(e) => setCreateForm({ ...createForm, minScore: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Initial Balance (cents)</label>
                <input type="number" value={createForm.balance} onChange={(e) => setCreateForm({ ...createForm, balance: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
              </div>

              <button
                onClick={handleCreate}
                className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
              >
                Create Client
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>Admin Dashboard — Client data is confidential.</p>
      </footer>
    </main>
  );
}
