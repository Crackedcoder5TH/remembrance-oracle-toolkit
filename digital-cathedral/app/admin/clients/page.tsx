"use client";

/**
 * Admin Agent (client) Management — inside the shared PortalShell.
 *
 * Agent overview stats, list with search + status filter, create-agent modal,
 * agent detail with purchase history, revenue breakdown, and dispute handling.
 */

import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-sky-50 text-sky-700 border-sky-200",
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
  clientId: string; companyName: string; contactName: string; email: string; phone: string;
  status: string; pricingTier: string; pricePerLead: number; exclusivePrice: number;
  stateLicenses: string; coverageTypes: string; dailyCap: number; monthlyCap: number;
  minScore: number; balance: number; createdAt: string;
}
interface ClientStats {
  totalClients: number; activeClients: number; totalPurchases: number; totalRevenue: number;
  revenueThisMonth: number; purchasesThisMonth: number; disputesOpen: number;
}
interface Purchase {
  purchaseId: string; leadId: string; clientId: string; pricePaid: number; purchasedAt: string;
  status: string; exclusive: boolean; returnReason: string; returnDeadline: string;
}
interface RevenueEntry { clientId: string; companyName: string; totalRevenue: number; totalPurchases: number; }
type Tab = "clients" | "revenue" | "disputes";

const inputCls = "w-full rounded-lg border border-[#e2d9c9] bg-white px-3 py-2 text-sm text-[#211d18] placeholder:text-[#8a8175] outline-none focus:border-[#c9a75f]";
const th = "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-[#776e61]";
const td = "border-t border-[#eee7da] px-4 py-3 text-sm";

export default function AdminClientsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("clients");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 25;

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    companyName: "", contactName: "", email: "", phone: "", password: "",
    pricingTier: "standard", pricePerLead: 2500, exclusivePrice: 5000,
    dailyCap: 50, monthlyCap: 1000, minScore: 0, balance: 0,
    stateLicenses: [] as string[], coverageTypes: [] as string[],
  });
  const [createError, setCreateError] = useState("");

  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [clientPurchases, setClientPurchases] = useState<Purchase[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueEntry[]>([]);
  const [disputes, setDisputes] = useState<Purchase[]>([]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/revenue");
    if (res.status === 401 || res.status === 403) { router.push("/admin/login"); return; }
    if (res.ok) { const data = await res.json(); setStats(data.stats); setRevenueData(data.byClient || []); }
  }, [router]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (search) params.set("search", search);
    params.set("limit", String(LIMIT));
    params.set("offset", String(page * LIMIT));
    const res = await fetch(`/api/admin/clients?${params}`);
    if (res.ok) { const data = await res.json(); setClients(data.clients); setTotalClients(data.total); }
    setLoading(false);
  }, [filterStatus, search, page]);

  const fetchDisputes = useCallback(async () => {
    const res = await fetch("/api/admin/disputes");
    if (res.ok) { const data = await res.json(); setDisputes(data.purchases || []); }
  }, []);

  const fetchClientDetail = async (clientId: string) => {
    const res = await fetch(`/api/admin/clients/${clientId}`);
    if (res.ok) { const data = await res.json(); setSelectedClient(data.client); setClientPurchases(data.purchases?.purchases || []); }
  };

  useEffect(() => { fetchStats(); fetchClients(); fetchDisputes(); }, [fetchStats, fetchClients, fetchDisputes]);

  const handleCreate = async () => {
    setCreateError("");
    const res = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm) });
    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setCreateForm({ companyName: "", contactName: "", email: "", phone: "", password: "", pricingTier: "standard", pricePerLead: 2500, exclusivePrice: 5000, dailyCap: 50, monthlyCap: 1000, minScore: 0, balance: 0, stateLicenses: [], coverageTypes: [] });
      fetchClients(); fetchStats();
    } else { setCreateError(data.message || "Failed to create agent."); }
  };

  const handleDisputeAction = async (purchaseId: string, action: string, clientId: string, refundAmount: number) => {
    await fetch("/api/admin/disputes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchaseId, action, clientId, refundAmount }) });
    fetchDisputes(); fetchStats();
  };

  const handleUpdateClient = async (clientId: string, updates: Record<string, unknown>) => {
    await fetch(`/api/admin/clients/${clientId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    fetchClients(); fetchStats();
    if (selectedClient?.clientId === clientId) fetchClientDetail(clientId);
  };

  const handleSeedTestClient = async () => {
    const res = await fetch("/api/admin/seed-client", { method: "POST", headers: { "Content-Type": "application/json" } });
    const data = await res.json();
    if (data.success) { setMessage(`Test agent ready! Email: ${data.credentials.email} | Password: ${data.credentials.password}`); fetchClients(); fetchStats(); }
    else { setMessage(data.message || "Failed to seed test agent."); }
  };

  const totalPages = Math.ceil(totalClients / LIMIT);
  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <PortalShell role="admin" eyebrow="Agents" title="Agent Management" description="Onboard and manage agent accounts — status, pricing, caps, purchase history, revenue, and disputes.">
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <button onClick={handleSeedTestClient} className="rounded-lg border border-[#e2d9c9] px-4 py-2 text-sm text-[#776e61] hover:border-[#c9a75f]">Seed test agent</button>
        <button onClick={() => setShowCreate(true)} className="rounded-lg bg-[#176b65] px-4 py-2 text-sm font-semibold text-white">+ New agent</button>
      </div>

      {message && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#cfe6df] bg-[#e8f3f1] p-3 text-sm text-[#355d59]" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-[#176b65]">&times;</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" role="region" aria-label="Agent statistics">
          <MetricCard label="Total agents" value={stats.totalClients} note="All accounts" />
          <MetricCard label="Active" value={stats.activeClients} note="Eligible to purchase" />
          <MetricCard label="Revenue (month)" value={formatCents(stats.revenueThisMonth)} note="Delivered this month" />
          <MetricCard label="Open disputes" value={stats.disputesOpen} note="Needs review" urgent={stats.disputesOpen > 0} />
        </div>
      )}

      <div className="mt-5 flex gap-1">
        {(["clients", "revenue", "disputes"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm capitalize transition ${tab === t ? "bg-[#c9a75f] font-semibold text-[#181510]" : "text-[#776e61] hover:bg-[#faf7f0]"}`}>
            {t === "clients" ? "Agents" : t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "clients" && (
          <>
            <Panel title="Find an agent">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <input type="text" placeholder="Search company, name, or email…" value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(0); }}
                  className={`${inputCls} col-span-2`} />
                <select value={filterStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFilterStatus(e.target.value); setPage(0); }} className={inputCls}>
                  <option value="">All status</option>
                  <option value="pending">Pending verification</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="closed">Closed</option>
                </select>
                <button onClick={() => { setFilterStatus(""); setSearch(""); setPage(0); }} className="text-sm text-[#176b65] underline">Clear</button>
              </div>
            </Panel>

            <div className="mt-5">
              <Panel title="Agents">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr>{["Company", "Contact", "Status", "Tier", "Balance", "Price/Lead", "Caps (D/M)", "Joined"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className={`${td} text-center text-[#8a8175]`}>Loading…</td></tr>
                      ) : clients.length === 0 ? (
                        <tr><td colSpan={8} className={`${td} text-center text-[#8a8175]`}>No agents found.</td></tr>
                      ) : (
                        clients.map((c) => (
                          <tr key={c.clientId} onClick={() => fetchClientDetail(c.clientId)} className="cursor-pointer hover:bg-[#faf7f0]">
                            <td className={`${td} font-semibold text-[#211d18]`}>{c.companyName}</td>
                            <td className={td}><div className="text-[#211d18]">{c.contactName}</div><div className="text-xs text-[#8a8175]">{c.email}</div></td>
                            <td className={td}><span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] || ""}`}>{c.status}</span></td>
                            <td className={`${td} capitalize text-[#776e61]`}>{c.pricingTier}</td>
                            <td className={`${td} text-[#211d18]`}>{formatCents(c.balance)}</td>
                            <td className={`${td} text-[#776e61]`}>{formatCents(c.pricePerLead)}</td>
                            <td className={`${td} text-[#776e61]`}>{c.dailyCap}/{c.monthlyCap}</td>
                            <td className={`${td} whitespace-nowrap text-xs text-[#776e61]`}>{new Date(c.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <nav className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-[#8a8175]">Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, totalClients)} of {totalClients}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 hover:border-[#c9a75f] disabled:opacity-40">Prev</button>
                      <span className="text-[#776e61]">{page + 1} / {totalPages}</span>
                      <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-[#e2d9c9] px-3 py-1.5 hover:border-[#c9a75f] disabled:opacity-40">Next</button>
                    </div>
                  </nav>
                )}
              </Panel>
            </div>
          </>
        )}

        {tab === "revenue" && (
          <Panel title="Revenue by agent">
            {stats && (
              <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                <div><p className="text-xs uppercase tracking-wide text-[#776e61]">Total revenue</p><p className="font-serif text-2xl text-[#211d18]">{formatCents(stats.totalRevenue)}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-[#776e61]">Total purchases</p><p className="font-serif text-2xl text-[#211d18]">{stats.totalPurchases}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-[#776e61]">This month</p><p className="font-serif text-2xl text-[#176b65]">{formatCents(stats.revenueThisMonth)} <span className="text-sm text-[#8a8175]">({stats.purchasesThisMonth})</span></p></div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr>{["Agent", "Total revenue", "Leads purchased", "Avg cost/lead"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {revenueData.length === 0 ? (
                    <tr><td colSpan={4} className={`${td} text-center text-[#8a8175]`}>No revenue data yet.</td></tr>
                  ) : revenueData.map((r) => (
                    <tr key={r.clientId}>
                      <td className={`${td} font-semibold text-[#211d18]`}>{r.companyName}</td>
                      <td className={`${td} text-[#211d18]`}>{formatCents(r.totalRevenue)}</td>
                      <td className={`${td} text-[#776e61]`}>{r.totalPurchases}</td>
                      <td className={`${td} text-[#776e61]`}>{r.totalPurchases > 0 ? formatCents(Math.round(r.totalRevenue / r.totalPurchases)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === "disputes" && (
          <Panel title="Open disputes">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr>{["Purchase", "Lead", "Agent", "Price", "Reason", "Actions"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {disputes.length === 0 ? (
                    <tr><td colSpan={6} className={`${td} text-center text-[#8a8175]`}>No open disputes.</td></tr>
                  ) : disputes.map((d) => (
                    <tr key={d.purchaseId}>
                      <td className={`${td} font-mono text-xs text-[#211d18]`}>{d.purchaseId.slice(0, 20)}…</td>
                      <td className={`${td} font-mono text-xs text-[#776e61]`}>{d.leadId.slice(0, 16)}…</td>
                      <td className={`${td} text-[#211d18]`}>{d.clientId.slice(0, 16)}…</td>
                      <td className={`${td} text-[#211d18]`}>{formatCents(d.pricePaid)}</td>
                      <td className={`${td} max-w-xs truncate text-xs text-[#776e61]`}>{d.returnReason}</td>
                      <td className={td}>
                        <div className="flex gap-2">
                          <button onClick={() => handleDisputeAction(d.purchaseId, "approve", d.clientId, d.pricePaid)} className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-200">Approve</button>
                          <button onClick={() => handleDisputeAction(d.purchaseId, "deny", d.clientId, 0)} className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200">Deny</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      {/* Agent detail modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e2d9c9] bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-serif text-xl text-[#211d18]">{selectedClient.companyName}</h2>
                <p className="text-sm text-[#8a8175]">{selectedClient.contactName} · {selectedClient.email}</p>
              </div>
              <button onClick={() => setSelectedClient(null)} className="text-xl text-[#8a8175] hover:text-[#211d18]">&times;</button>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
              <div><p className="text-xs uppercase text-[#776e61]">Status</p><span className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[selectedClient.status] || ""}`}>{selectedClient.status}</span></div>
              <div><p className="text-xs uppercase text-[#776e61]">Balance</p><p className="text-[#211d18]">{formatCents(selectedClient.balance)}</p></div>
              <div><p className="text-xs uppercase text-[#776e61]">Price / lead</p><p className="text-[#211d18]">{formatCents(selectedClient.pricePerLead)}</p></div>
              <div><p className="text-xs uppercase text-[#776e61]">Exclusive price</p><p className="text-[#211d18]">{formatCents(selectedClient.exclusivePrice)}</p></div>
              <div><p className="text-xs uppercase text-[#776e61]">Caps (D / M)</p><p className="text-[#211d18]">{selectedClient.dailyCap} / {selectedClient.monthlyCap}</p></div>
              <div><p className="text-xs uppercase text-[#776e61]">Min score</p><p className="text-[#211d18]">{selectedClient.minScore}</p></div>
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
              {selectedClient.status === "pending" && <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "active" })} className="rounded bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-200" title="License verified — promote to active.">Approve (verify license)</button>}
              {selectedClient.status === "active" && <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "suspended" })} className="rounded bg-amber-100 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-200">Suspend</button>}
              {selectedClient.status === "suspended" && <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "active" })} className="rounded bg-emerald-100 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-200">Reactivate</button>}
              {selectedClient.status !== "closed" && <button onClick={() => handleUpdateClient(selectedClient.clientId, { status: "closed" })} className="rounded bg-red-100 px-3 py-1.5 text-xs text-red-700 hover:bg-red-200">Close</button>}
            </div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#94732e]">Purchase history</h3>
            {clientPurchases.length === 0 ? (
              <p className="text-sm text-[#8a8175]">No purchases yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["Lead", "Price", "Type", "Status", "Date"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {clientPurchases.map((p) => (
                      <tr key={p.purchaseId}>
                        <td className={`${td} font-mono text-xs`}>{p.leadId.slice(0, 16)}…</td>
                        <td className={`${td} text-[#211d18]`}>{formatCents(p.pricePaid)}</td>
                        <td className={`${td} text-[#776e61]`}>{p.exclusive ? "Exclusive" : "Shared"}</td>
                        <td className={td}><span className={`inline-block rounded border px-2 py-0.5 text-xs ${PURCHASE_STATUS_STYLES[p.status] || ""}`}>{p.status}</span></td>
                        <td className={`${td} text-xs text-[#8a8175]`}>{new Date(p.purchasedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create agent modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e2d9c9] bg-white p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-xl text-[#211d18]">Create new agent</h2>
              <button onClick={() => setShowCreate(false)} className="text-xl text-[#8a8175] hover:text-[#211d18]">&times;</button>
            </div>
            {createError && <p className="mb-4 text-sm text-red-600">{createError}</p>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs text-[#776e61]">Company name *</label><input type="text" value={createForm.companyName} onChange={(e) => setCreateForm({ ...createForm, companyName: e.target.value })} className={inputCls} /></div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Contact name *</label><input type="text" value={createForm.contactName} onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs text-[#776e61]">Email *</label><input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className={inputCls} /></div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Phone</label><input type="tel" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="mb-1 block text-xs text-[#776e61]">Password *</label><input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="mb-1 block text-xs text-[#776e61]">Pricing tier</label>
                  <select value={createForm.pricingTier} onChange={(e) => setCreateForm({ ...createForm, pricingTier: e.target.value })} className={inputCls}>
                    <option value="standard">Standard</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Price/lead (cents)</label><input type="number" value={createForm.pricePerLead} onChange={(e) => setCreateForm({ ...createForm, pricePerLead: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Exclusive (cents)</label><input type="number" value={createForm.exclusivePrice} onChange={(e) => setCreateForm({ ...createForm, exclusivePrice: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="mb-1 block text-xs text-[#776e61]">Daily cap</label><input type="number" value={createForm.dailyCap} onChange={(e) => setCreateForm({ ...createForm, dailyCap: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Monthly cap</label><input type="number" value={createForm.monthlyCap} onChange={(e) => setCreateForm({ ...createForm, monthlyCap: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
                <div><label className="mb-1 block text-xs text-[#776e61]">Min score</label><input type="number" value={createForm.minScore} onChange={(e) => setCreateForm({ ...createForm, minScore: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
              </div>
              <div><label className="mb-1 block text-xs text-[#776e61]">Initial balance (cents)</label><input type="number" value={createForm.balance} onChange={(e) => setCreateForm({ ...createForm, balance: parseInt(e.target.value) || 0 })} className={inputCls} /></div>
              <button onClick={handleCreate} className="w-full rounded-lg bg-[#176b65] px-4 py-3 text-sm font-semibold text-white">Create agent</button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
