"use client";

/**
 * Client Portal Dashboard
 *
 * Features:
 *  - Browse available leads (gated — no contact info until purchased)
 *  - One-click lead purchase (shared or exclusive)
 *  - Purchase history with full lead data
 *  - Return requests (within 72-hour window)
 *  - Billing overview and balance
 *  - Delivery filter management
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "../../packages/shared/src/validate-state";

const COVERAGE_LABELS: Record<string, string> = {
  "term": "Term Life",
  "whole": "Whole Life",
  "universal": "Universal Life",
  "final-expense": "Final Expense",
  "annuity": "Annuity",
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
  balance: number;
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
  pricePerLead?: number;
  exclusivePrice?: number;
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
  const [balance, setBalance] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    states: [], coverageTypes: [], veteranOnly: false, minScore: 0, maxLeadAge: 72, distributionMode: "shared",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    cardholderName: "",
    cardNumber: "",
    expMonth: "",
    expYear: "",
    cvv: "",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    fundAmount: "100.00",
    saveCard: true,
  });
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [savedCard, setSavedCard] = useState<{ last4: string; brand: string; expiry: string } | null>(null);

  // Lead filters
  const [filterState, setFilterState] = useState("");
  const [filterCoverage, setFilterCoverage] = useState("");

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/client/profile");
    if (res.status === 401) { router.push("/portal/login"); return; }
    if (res.ok) {
      const data = await res.json();
      setProfile(data.client);
      setBalance(data.client.balance);
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
      setBalance(data.balance || 0);
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

  const handlePurchase = async (leadId: string, exclusive: boolean) => {
    setMessage("");
    const res = await fetch("/api/client/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, exclusive }),
    });
    const data = await res.json();
    if (data.success) {
      setMessage(`Lead purchased! ${exclusive ? "(Exclusive)" : "(Shared)"} — $${(data.pricePaid / 100).toFixed(2)}`);
      setBalance(data.newBalance);
      fetchLeads();
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

  // Format card number with spaces (4-4-4-4)
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  // Detect card brand from number
  const getCardBrand = (num: string): string => {
    const d = num.replace(/\D/g, "");
    if (/^4/.test(d)) return "Visa";
    if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return "Mastercard";
    if (/^3[47]/.test(d)) return "Amex";
    if (/^6(?:011|5)/.test(d)) return "Discover";
    return "";
  };

  const handleAddFunds = async () => {
    const { cardholderName, cardNumber, expMonth, expYear, cvv, billingAddress, billingCity, billingState, billingZip, fundAmount } = paymentForm;
    const digits = cardNumber.replace(/\D/g, "");

    // Client-side validation
    if (!cardholderName.trim()) { setMessage("Please enter the cardholder name."); return; }
    if (digits.length < 15) { setMessage("Please enter a valid card number."); return; }
    if (!expMonth || !expYear) { setMessage("Please select the expiration date."); return; }
    if (cvv.length < 3) { setMessage("Please enter a valid CVV."); return; }
    if (!billingAddress.trim()) { setMessage("Please enter the billing address."); return; }
    if (!billingCity.trim()) { setMessage("Please enter the billing city."); return; }
    if (!billingState) { setMessage("Please select the billing state."); return; }
    if (!/^\d{5}(-\d{4})?$/.test(billingZip)) { setMessage("Please enter a valid ZIP code."); return; }

    const amountCents = Math.round(parseFloat(fundAmount) * 100);
    if (isNaN(amountCents) || amountCents < 500) { setMessage("Minimum fund amount is $5.00."); return; }
    if (amountCents > 1000000) { setMessage("Maximum fund amount is $10,000.00."); return; }

    // Check expiry isn't in the past
    const now = new Date();
    const expiry = new Date(parseInt(expYear), parseInt(expMonth) - 1);
    if (expiry < now) { setMessage("Card is expired."); return; }

    setPaymentProcessing(true);
    setMessage("");

    try {
      const res = await fetch("/api/client/add-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountCents,
          cardLast4: digits.slice(-4),
          cardBrand: getCardBrand(digits),
          cardExpiry: `${expMonth}/${expYear.slice(-2)}`,
          saveCard: paymentForm.saveCard,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setBalance(data.newBalance);
        setMessage(`Payment successful! ${formatCents(amountCents)} added to your balance.`);
        if (paymentForm.saveCard) {
          setSavedCard({ last4: digits.slice(-4), brand: getCardBrand(digits), expiry: `${expMonth}/${expYear.slice(-2)}` });
        }
        // Clear sensitive fields
        setPaymentForm((prev) => ({ ...prev, cardNumber: "", cvv: "", fundAmount: "100.00" }));
        fetchBilling();
      } else {
        setMessage(data.message || "Payment failed. Please try again.");
      }
    } catch {
      setMessage("Network error. Payment was not processed.");
    } finally {
      setPaymentProcessing(false);
    }
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
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)] uppercase">Balance</p>
            <p className="text-lg font-light text-teal-cathedral">{formatCents(balance)}</p>
          </div>
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
                  <th className="px-4 py-3">Veteran</th>
                  <th className="px-4 py-3">Date</th>
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
                        {lead.veteranStatus === "veteran"
                          ? <span className="text-teal-cathedral text-xs">Veteran</span>
                          : <span className="text-[var(--text-muted)] text-xs">Non-Veteran</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {lead.purchased ? (
                          <div className="text-xs">
                            <p className="text-teal-cathedral font-medium">Purchased</p>
                            <p className="text-[var(--text-primary)]">{lead.firstName} {lead.lastName}</p>
                            <p className="text-[var(--text-muted)]">{lead.email}</p>
                            <p className="text-[var(--text-muted)]">{lead.phone}</p>
                          </div>
                        ) : lead.available ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePurchase(lead.leadId, false)}
                              className="px-2 py-1 rounded text-xs bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
                            >
                              Buy {lead.pricePerLead ? formatCents(lead.pricePerLead) : ""}
                            </button>
                            <button
                              onClick={() => handlePurchase(lead.leadId, true)}
                              className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200"
                            >
                              Exclusive {lead.exclusivePrice ? formatCents(lead.exclusivePrice) : ""}
                            </button>
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
          {/* Balance Overview */}
          <div className="cathedral-surface p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Current Balance</p>
                <p className="text-3xl font-light text-teal-cathedral">{formatCents(balance)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Shared Lead Price</p>
                <p className="text-lg text-[var(--text-primary)]">{profile ? formatCents(profile.pricePerLead) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Exclusive Lead Price</p>
                <p className="text-lg text-[var(--text-primary)]">{profile ? formatCents(profile.exclusivePrice) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase">Leads Available</p>
                <p className="text-lg text-[var(--text-primary)]">
                  ~{profile ? Math.floor(balance / profile.pricePerLead) : 0} shared
                </p>
              </div>
            </div>
          </div>

          {/* Saved Payment Method */}
          {savedCard && (
            <div className="cathedral-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-7 rounded bg-[var(--bg-surface)] border border-indigo-cathedral/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-[var(--text-muted)]">{savedCard.brand.slice(0, 4)}</span>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-primary)]">{savedCard.brand} ending in {savedCard.last4}</p>
                    <p className="text-xs text-[var(--text-muted)]">Expires {savedCard.expiry}</p>
                  </div>
                </div>
                <button onClick={() => setSavedCard(null)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
            </div>
          )}

          {/* Add Funds — Payment Form */}
          <div className="cathedral-surface p-6">
            <h3 className="text-lg font-light text-[var(--text-primary)] mb-1">Add Funds</h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">Add funds to your balance to purchase leads. Your card information is encrypted and secured.</p>

            <div className="space-y-5">
              {/* Fund Amount — Quick Select */}
              <div>
                <label className="block text-xs metallic-gold uppercase tracking-wider mb-2">Fund Amount</label>
                <div className="flex gap-2 mb-3">
                  {["50.00", "100.00", "250.00", "500.00", "1000.00"].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setPaymentForm((prev) => ({ ...prev, fundAmount: amt }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        paymentForm.fundAmount === amt
                          ? "bg-teal-cathedral text-white"
                          : "text-[var(--text-muted)] border border-indigo-cathedral/10 hover:border-indigo-cathedral/25"
                      }`}
                    >
                      ${parseFloat(amt).toFixed(0)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)]">$</span>
                  <input
                    type="text"
                    value={paymentForm.fundAmount}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, fundAmount: e.target.value.replace(/[^0-9.]/g, "") }))}
                    className="w-32 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral"
                    placeholder="100.00"
                  />
                  <span className="text-xs text-[var(--text-muted)]">USD (min $5.00)</span>
                </div>
              </div>

              <hr className="border-indigo-cathedral/10" />

              {/* Card Information */}
              <div>
                <label className="block text-xs metallic-gold uppercase tracking-wider mb-3">Card Information</label>

                {/* Cardholder Name */}
                <div className="mb-3">
                  <label className="block text-xs text-white mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    value={paymentForm.cardholderName}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardholderName: e.target.value }))}
                    placeholder="John A. Smith"
                    autoComplete="cc-name"
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral"
                  />
                </div>

                {/* Card Number */}
                <div className="mb-3">
                  <label className="block text-xs text-white mb-1">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={paymentForm.cardNumber}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cardNumber: formatCardNumber(e.target.value) }))}
                      placeholder="4242 4242 4242 4242"
                      autoComplete="cc-number"
                      inputMode="numeric"
                      maxLength={19}
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral pr-16"
                    />
                    {getCardBrand(paymentForm.cardNumber) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-teal-cathedral">
                        {getCardBrand(paymentForm.cardNumber)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expiry + CVV */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-white mb-1">Month</label>
                    <select
                      value={paymentForm.expMonth}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, expMonth: e.target.value }))}
                      autoComplete="cc-exp-month"
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral appearance-none"
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = String(i + 1).padStart(2, "0");
                        return <option key={m} value={m}>{m}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">Year</label>
                    <select
                      value={paymentForm.expYear}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, expYear: e.target.value }))}
                      autoComplete="cc-exp-year"
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral appearance-none"
                    >
                      <option value="">YYYY</option>
                      {Array.from({ length: 10 }, (_, i) => {
                        const y = String(new Date().getFullYear() + i);
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">CVV</label>
                    <input
                      type="text"
                      value={paymentForm.cvv}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      placeholder="123"
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      maxLength={4}
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-indigo-cathedral/10" />

              {/* Billing Address */}
              <div>
                <label className="block text-xs metallic-gold uppercase tracking-wider mb-3">Billing Address</label>

                <div className="mb-3">
                  <label className="block text-xs text-white mb-1">Street Address</label>
                  <input
                    type="text"
                    value={paymentForm.billingAddress}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, billingAddress: e.target.value }))}
                    placeholder="123 Main Street, Suite 100"
                    autoComplete="street-address"
                    className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-white mb-1">City</label>
                    <input
                      type="text"
                      value={paymentForm.billingCity}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, billingCity: e.target.value }))}
                      placeholder="Dallas"
                      autoComplete="address-level2"
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">State</label>
                    <select
                      value={paymentForm.billingState}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, billingState: e.target.value }))}
                      autoComplete="address-level1"
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral appearance-none"
                    >
                      <option value="">Select</option>
                      {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white mb-1">ZIP Code</label>
                    <input
                      type="text"
                      value={paymentForm.billingZip}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, billingZip: e.target.value.replace(/[^0-9-]/g, "").slice(0, 10) }))}
                      placeholder="75201"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      maxLength={10}
                      className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 ring-1 ring-gray-400 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-cathedral"
                    />
                  </div>
                </div>
              </div>

              {/* Save Card Checkbox */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={paymentForm.saveCard}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, saveCard: e.target.checked }))}
                  className="rounded border-indigo-cathedral/10"
                  id="saveCard"
                />
                <label htmlFor="saveCard" className="text-sm text-[var(--text-primary)]">Save this card for future payments</label>
              </div>

              {/* Security Note */}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-indigo-cathedral/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 mt-0.5 text-teal-cathedral" aria-hidden="true">
                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-xs text-[var(--text-muted)]">
                  Your payment information is encrypted and transmitted securely. We never store your full card number.
                </p>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleAddFunds}
                disabled={paymentProcessing}
                className="w-full px-6 py-3.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paymentProcessing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    Add Funds — ${parseFloat(paymentForm.fundAmount || "0").toFixed(2)}
                  </>
                )}
              </button>
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
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">No transactions yet. Add funds to get started.</td></tr>
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
            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase mb-2">Distribution Mode</label>
              <select value={filters.distributionMode} onChange={(e) => setFilters({ ...filters, distributionMode: e.target.value })}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 appearance-none">
                <option value="shared">Shared (lower cost, lead may go to others)</option>
                <option value="exclusive">Exclusive (higher cost, lead is yours only)</option>
                <option value="round-robin">Round Robin (fair rotation)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase mb-2">Minimum Lead Score</label>
              <input type="number" value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: parseInt(e.target.value) || 0 })}
                min="0" max="100"
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 w-32" />
              <p className="text-xs text-[var(--text-muted)] mt-1">0–100. Higher = hotter leads only.</p>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase mb-2">Max Lead Age (hours)</label>
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

      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>Client Portal — Lead data is confidential and for your use only.</p>
      </footer>
    </main>
  );
}
