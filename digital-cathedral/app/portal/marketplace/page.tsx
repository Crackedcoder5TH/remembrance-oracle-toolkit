"use client";

/**
 * Client Portal Dashboard
 *
 * Features:
 *  - Browse available leads (gated — no contact info until purchased)
 *  - One-click lead purchase (shared or exclusive)
 *  - Purchase history with full lead data
 *  - Return requests (within 72-hour window)
 *  - Billing overview and pricing
 *  - Delivery filter management
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

const TIER_STYLES: Record<string, string> = {
  hot: "bg-red-50 text-red-700 border-red-200",
  warm: "bg-amber-50 text-amber-700 border-amber-200",
  standard: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cool: "bg-sky-50 text-sky-700 border-sky-200",
};

interface ClientProfile {
  clientId: string;
  companyName: string;
  contactName: string;
  email: string;
  pricePerLead: number;
  exclusivePrice: number;
  dailyCap: number;
  monthlyCap: number;
  minScore: number;
}

interface AvailableLead {
  leadId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  score: number;
  tier: string;
  createdAt: string;
  purchased: boolean;
  available: boolean;
  buyerCount?: number;
  ageInDays?: number;
  tierPrices?: Array<{
    name: string;
    maxBuyers: number;
    price: number;
    soldOut: boolean;
  }>;
}

interface Purchase {
  purchaseId: string;
  leadId: string;
  pricePaid: number;
  purchasedAt: string;
  status: string;
  exclusive: boolean;
  returnReason: string;
  returnDeadline: string;
}

interface BillingRecord {
  billingId: string;
  periodStart: string;
  periodEnd: string;
  leadsPurchased: number;
  totalAmount: number;
  paymentStatus: string;
}

interface Filters {
  states: string[];
  coverageTypes: string[];
  veteranOnly: boolean;
  minScore: number;
  maxLeadAge: number;
  distributionMode: string;
}

type Tab = "leads" | "purchases" | "billing" | "filters";

export default function ClientPortal() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("leads");
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [leads, setLeads] = useState<AvailableLead[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [filters, setFilters] = useState<Filters>({
    states: [], coverageTypes: [], veteranOnly: false, minScore: 0, maxLeadAge: 72, distributionMode: "shared",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");


  // Lead filters
  const [filterState, setFilterState] = useState("");
  const [filterCoverage, setFilterCoverage] = useState("");

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/client/profile");
    if (res.status === 401) { router.push("/portal/login"); return; }
    if (res.ok) {
      const data = await res.json();
      setProfile(data.client);
    }
  }, [router]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterState) params.set("state", filterState);
    if (filterCoverage) params.set("coverage", filterCoverage);
    params.set("limit", "25");

    const res = await fetch(`/api/client/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
    }
    setLoading(false);
  }, [filterState, filterCoverage]);

  const fetchPurchases = useCallback(async () => {
    const res = await fetch("/api/client/purchases");
    if (res.ok) {
      const data = await res.json();
      setPurchases(data.purchases || []);
    }
  }, []);

  const fetchBilling = useCallback(async () => {
    const res = await fetch("/api/client/billing");
    if (res.ok) {
      const data = await res.json();
      setBilling(data.billing || []);
    }
  }, []);

  const fetchFilters = useCallback(async () => {
    const res = await fetch("/api/client/filters");
    if (res.ok) {
      const data = await res.json();
      if (data.filters) {
        setFilters({
          states: JSON.parse(data.filters.states || "[]"),
          coverageTypes: JSON.parse(data.filters.coverageTypes || "[]"),
          veteranOnly: data.filters.veteranOnly,
          minScore: data.filters.minScore,
          maxLeadAge: data.filters.maxLeadAge,
          distributionMode: data.filters.distributionMode,
        });
      }
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (tab === "leads") fetchLeads();
    else if (tab === "purchases") fetchPurchases();
    else if (tab === "billing") fetchBilling();
    else if (tab === "filters") fetchFilters();
  }, [tab, fetchLeads, fetchPurchases, fetchBilling, fetchFilters]);

  // Handle payment return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const sessionId = params.get("session_id");
    const tabParam = params.get("tab") as Tab | null;

    if (tabParam) setTab(tabParam);

    if (payment === "success" && sessionId) {
      // Fulfill the purchase via the success callback
      fetch(`/api/client/purchase/success?session_id=${sessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setMessage(`Lead purchased! ${data.exclusive ? "(Exclusive)" : "(Shared)"} — $${(data.pricePaid / 100).toFixed(2)}`);
          } else {
            setMessage(data.message || "Purchase fulfillment issue — contact support.");
          }
        })
        .catch(() => setMessage("Could not verify payment — contact support."));
      // Clean URL params
      window.history.replaceState({}, "", "/portal");
    } else if (payment === "cancelled") {
      setMessage("Payment cancelled. You have not been charged.");
      window.history.replaceState({}, "", "/portal");
    }
  }, []);

  const handlePurchase = async (leadId: string, tierIndex: number) => {
    setMessage("");
    const res = await fetch("/api/client/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, tierIndex }),
    });
    const data = await res.json();
    if (data.success && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      setMessage(data.message || "Purchase failed.");
    }
  };

  const handleReturn = async (purchaseId: string) => {
    const reason = prompt("Reason for return (e.g., wrong number, fake info):");
    if (!reason) return;

    const res = await fetch("/api/client/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseId, reason }),
    });
    const data = await res.json();
    setMessage(data.message || "Return submitted.");
    fetchPurchases();
  };

  const handleSaveFilters = async () => {
    const res = await fetch("/api/client/filters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    const data = await res.json();
    setMessage(data.success ? "Filters saved!" : "Failed to save filters.");
  };

  const handleLogout = async () => {
    await fetch("/api/client/logout", { method: "POST" });
    router.push("/portal/login");
  };

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase pulse-gentle">Client Portal</div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">{profile.companyName}</h1>
          <p className="text-sm text-[var(--text-muted)]">{profile.contactName}</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleLogout} className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25">Logout</button>
        </div>
      </header>

      {/* Message flash */}
      {message && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20" role="status">
          {message}
          <button onClick={() => setMessage("")} className="float-right text-teal-cathedral/60 hover:text-teal-cathedral">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(["leads", "purchases", "billing", "filters"] as Tab[]).map((t) => (
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

      {/* ─── Available Leads Tab ─── */}
      {tab === "leads" && (
        <>
          <div className="cathedral-surface p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none">
                <option value="">All States</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              <select value={filterCoverage} onChange={(e) => setFilterCoverage(e.target.value)}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none">
                <option value="">All Coverage</option>
                {Object.entries(COVERAGE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
              <button onClick={() => { setFilterState(""); setFilterCoverage(""); }} className="text-sm text-teal-cathedral underline py-2">Clear</button>
            </div>
          </div>

          <div className="cathedral-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Coverage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">Loading leads...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">No leads available.</td></tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.leadId} className="border-b border-indigo-cathedral/5 hover:bg-[var(--bg-surface)]/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${TIER_STYLES[lead.tier] || ""}`}>
                          {lead.score} <span className="opacity-70">{lead.tier}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">{lead.state}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest}</td>
                      <td className="px-4 py-3">
                        {lead.veteranStatus === "non-military"
                          ? <span className="text-[var(--text-muted)] text-xs">Non-Military</span>
                          : <span className="text-teal-cathedral text-xs capitalize">{lead.veteranStatus?.replace("-", " ")}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {lead.ageInDays !== undefined ? (
                          <div>
                            <span className="text-[var(--text-primary)]">{lead.ageInDays < 1 ? "<1" : Math.floor(lead.ageInDays)}d</span>
                            <span className="block text-[var(--text-muted)] text-[10px]">{lead.buyerCount || 0} buyer{(lead.buyerCount || 0) !== 1 ? "s" : ""}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">{new Date(lead.createdAt).toLocaleDateString()}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.purchased ? (
                          <div className="text-xs">
                            <p className="text-teal-cathedral font-medium">Purchased</p>
                            <p className="text-[var(--text-primary)]">{lead.firstName} {lead.lastName}</p>
                            <p className="text-[var(--text-muted)]">{lead.email}</p>
                            <p className="text-[var(--text-muted)]">{lead.phone}</p>
                          </div>
                        ) : lead.available && lead.tierPrices ? (
                          <div className="flex flex-col gap-1">
                            {lead.tierPrices.map((tp, idx) => {
                              const tierBtnStyles = [
                                "metallic-gold-card text-yellow-800 hover:brightness-110",   // Exclusive — Gold
                                "metallic-silver-card text-gray-700 hover:brightness-110",   // Semi-Exclusive — Silver
                                "metallic-bronze-card text-amber-900 hover:brightness-110",  // Warm Shared — Bronze
                                "metallic-sky-card text-sky-800 hover:brightness-110",       // Cool Shared — Sky Blue
                              ];
                              const soldOutStyle = "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200";
                              return (
                                <button
                                  key={tp.name}
                                  disabled={tp.soldOut}
                                  onClick={() => handlePurchase(lead.leadId, idx)}
                                  className={`px-2 py-1 rounded text-[11px] transition-all ${tp.soldOut ? soldOutStyle : tierBtnStyles[idx]}`}
                                >
                                  {tp.soldOut
                                    ? `${tp.name} — Sold Out`
                                    : `${tp.name} ${formatCents(tp.price)}`}
                                  <span className="opacity-60 ml-0.5">({tp.maxBuyers})</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] text-xs">Below min score</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Purchases Tab ─── */}
      {tab === "purchases" && (
        <div className="cathedral-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                <th className="px-4 py-3">Lead ID</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">No purchases yet.</td></tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.purchaseId} className="border-b border-indigo-cathedral/5">
                    <td className="px-4 py-3 text-[var(--text-primary)] text-xs font-mono">{p.leadId.slice(0, 20)}...</td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{formatCents(p.pricePaid)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{p.exclusive ? "Exclusive" : "Shared"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs border ${
                        p.status === "delivered" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        p.status === "disputed" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-red-50 text-red-700 border-red-200"
                      }`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(p.purchasedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {p.status === "delivered" && new Date(p.returnDeadline) > new Date() && (
                        <button
                          onClick={() => handleReturn(p.purchaseId)}
                          className="px-2 py-1 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Request Return
                        </button>
                      )}
                      {p.status === "disputed" && (
                        <span className="text-xs text-amber-600">Under review</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Billing Tab ─── */}
      {tab === "billing" && (
        <div className="space-y-6">
          {/* Pricing Tiers */}
          <div className="cathedral-surface p-6">
            <h3 className="text-lg font-light text-[var(--text-primary)] mb-4">Lead Pricing Tiers</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: "Exclusive", buyers: "1 buyer", price: 12000, cardClass: "metallic-gold-card", labelClass: "metallic-gold" },
                { name: "Semi-Exclusive", buyers: "2 buyers", price: 10000, cardClass: "metallic-silver-card", labelClass: "metallic-silver" },
                { name: "Warm Shared", buyers: "3–4 buyers", price: 8000, cardClass: "metallic-bronze-card", labelClass: "metallic-bronze" },
                { name: "Cool Shared", buyers: "5–6 buyers", price: 6000, cardClass: "metallic-sky-card", labelClass: "metallic-sky" },
              ].map((t) => (
                <div key={t.name} className={`rounded-lg p-4 text-center ${t.cardClass}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${t.labelClass}`}>{t.name}</p>
                  <p className={`text-2xl font-bold ${t.labelClass}`}>{formatCents(t.price)}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{t.buyers}</p>
                </div>
              ))}
            </div>
          </div>

          {/* How Payment Works */}
          <div className="cathedral-surface p-6">
            <h3 className="text-lg font-light text-[var(--text-primary)] mb-1">How Payment Works</h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              Pay per lead at checkout — no stored balance needed. When you click &ldquo;Buy&rdquo; on a lead, you&apos;ll be taken to a secure Stripe checkout page.
            </p>

            <div className="mb-4">
              <p className="text-xs metallic-gold uppercase tracking-wider mb-3">Accepted Payment Methods</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-cathedral/10 bg-[var(--bg-surface)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-cathedral shrink-0" aria-hidden="true">
                    <path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">Credit / Debit Card</p>
                    <p className="text-xs text-[var(--text-muted)]">Visa, Mastercard, Amex</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-cathedral/10 bg-[var(--bg-surface)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-cathedral shrink-0" aria-hidden="true">
                    <path d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" />
                  </svg>
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">Bank Account</p>
                    <p className="text-xs text-[var(--text-muted)]">ACH direct debit</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-cathedral/10 bg-[var(--bg-surface)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-cathedral shrink-0" aria-hidden="true">
                    <path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">Cash App</p>
                    <p className="text-xs text-[var(--text-muted)]">Cash App Pay</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-indigo-cathedral/10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 mt-0.5 text-teal-cathedral" aria-hidden="true">
                <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p className="text-xs text-[var(--text-muted)]">
                All payments are securely processed by Stripe. We never see or store your payment details.
              </p>
            </div>
          </div>

          {/* Transaction History */}
          <div className="cathedral-surface overflow-x-auto">
            <div className="px-4 py-3 border-b border-indigo-cathedral/10">
              <h3 className="text-sm metallic-gold uppercase tracking-wider">Transaction History</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 text-[var(--text-muted)]">
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {billing.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">No transactions yet. Purchase a lead to get started.</td></tr>
                ) : (
                  billing.map((b) => (
                    <tr key={b.billingId} className="border-b border-indigo-cathedral/5">
                      <td className="px-4 py-3 text-[var(--text-primary)] text-xs">
                        {new Date(b.periodStart).toLocaleDateString()} — {new Date(b.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{b.leadsPurchased}</td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">{formatCents(b.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs border ${
                          b.paymentStatus === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          b.paymentStatus === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>{b.paymentStatus}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Filters Tab ─── */}
      {tab === "filters" && (
        <div className="cathedral-surface p-6">
          <h2 className="text-lg font-light text-[var(--text-primary)] mb-6">Delivery Preferences</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Set your preferences to auto-receive leads that match your criteria.
          </p>

          <div className="space-y-6">
            <div className="rounded-lg p-4 border border-indigo-cathedral/10">
              <label className="block text-xs metallic-gold uppercase mb-2">Distribution Mode</label>
              <select value={filters.distributionMode} onChange={(e) => setFilters({ ...filters, distributionMode: e.target.value })}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none">
                <option value="shared">Shared (lower cost, lead may go to others)</option>
                <option value="exclusive">Exclusive (higher cost, lead is yours only)</option>
                <option value="round-robin">Round Robin (fair rotation)</option>
              </select>
            </div>

            <div className="rounded-lg p-4 border border-indigo-cathedral/10">
              <label className="block text-xs metallic-gold uppercase mb-2">Minimum Lead Score</label>
              <input type="number" value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: parseInt(e.target.value) || 0 })}
                min="0" max="100"
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 w-32" />
              <p className="text-xs text-[var(--text-muted)] mt-1">0–100. Higher = hotter leads only.</p>
            </div>

            <div className="rounded-lg p-4 border border-indigo-cathedral/10">
              <label className="block text-xs metallic-gold uppercase mb-2">Max Lead Age (hours)</label>
              <input type="number" value={filters.maxLeadAge} onChange={(e) => setFilters({ ...filters, maxLeadAge: parseInt(e.target.value) || 72 })}
                min="1" max="168"
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 w-32" />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" checked={filters.veteranOnly} onChange={(e) => setFilters({ ...filters, veteranOnly: e.target.checked })}
                className="rounded border-indigo-cathedral/10" id="veteranOnly" />
              <label htmlFor="veteranOnly" className="text-sm text-[var(--text-primary)]">Veterans only</label>
            </div>

            <button
              onClick={handleSaveFilters}
              className="px-6 py-3 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}

      <footer className="mt-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/portal/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Terms of Service</a>
          <a href="/portal/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Privacy Policy</a>
        </nav>
        <p>Client Portal — Lead data is confidential and for your use only.</p>
        <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
      </footer>
    </main>
  );
}
