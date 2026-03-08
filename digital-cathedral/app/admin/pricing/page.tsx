"use client";

/**
 * Admin Pricing Management
 *
 * Allows admins to adjust lead pricing tiers, depreciation rates,
 * price floor, and max price — all changes take effect immediately.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface TierConfig {
  name: string;
  maxBuyers: number;
  basePrice: number;
  holdDays: number;
  dropAmount: number;
  dropInterval: number;
}

interface PricingConfig {
  maxPrice: number;
  priceFloor: number;
  tiers: TierConfig[];
  updatedAt: string;
  updatedBy: string;
}

const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function AdminPricing() {
  const router = useRouter();
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [simulateDay, setSimulateDay] = useState(0);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pricing");
    if (res.status === 401) { router.push("/admin/login"); return; }
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const showMessage = (msg: string, type: "success" | "error") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    const res = await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (data.success) {
      setConfig(data.config);
      showMessage("Pricing configuration saved successfully.", "success");
    } else {
      showMessage(data.message || "Failed to save.", "error");
    }
    setSaving(false);
  };

  const updateTier = (index: number, field: keyof TierConfig, value: string | number) => {
    if (!config) return;
    const tiers = [...config.tiers];
    tiers[index] = { ...tiers[index], [field]: typeof value === "string" && field !== "name" ? parseInt(value) || 0 : value };
    setConfig({ ...config, tiers });
  };

  const addTier = () => {
    if (!config) return;
    setConfig({
      ...config,
      tiers: [
        ...config.tiers,
        { name: "New Tier", maxBuyers: 1, basePrice: config.priceFloor, holdDays: 0, dropAmount: 0, dropInterval: 1 },
      ],
    });
  };

  const removeTier = (index: number) => {
    if (!config || config.tiers.length <= 1) return;
    const tiers = config.tiers.filter((_, i) => i !== index);
    setConfig({ ...config, tiers });
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  if (loading || !config) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading pricing config...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase pulse-gentle">Admin</div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">Pricing Configuration</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Last updated: {new Date(config.updatedAt).toLocaleString()} by {config.updatedBy}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90">
            Dashboard
          </button>
          <button onClick={handleLogout}
            className="px-4 py-2 rounded-lg text-sm text-teal-cathedral/70 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral">
            Logout
          </button>
        </div>
      </header>

      {/* Message flash */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          messageType === "success"
            ? "bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20"
            : "bg-red-50 text-red-700 border border-red-200"
        }`} role="status">
          {message}
          <button onClick={() => setMessage("")} className="float-right opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Global Settings */}
      <div className="cathedral-surface p-6 mb-6">
        <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">Global Price Bounds</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-xs metallic-gold uppercase tracking-wider mb-2">Maximum Price (cents)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={config.maxPrice}
                onChange={(e) => setConfig({ ...config, maxPrice: parseInt(e.target.value) || 0 })}
                min={100}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 w-36"
              />
              <span className="text-sm text-[var(--text-muted)]">{formatCents(config.maxPrice)}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs metallic-gold uppercase tracking-wider mb-2">Price Floor (cents)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={config.priceFloor}
                onChange={(e) => setConfig({ ...config, priceFloor: parseInt(e.target.value) || 0 })}
                min={0}
                className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25 w-36"
              />
              <span className="text-sm text-[var(--text-muted)]">{formatCents(config.priceFloor)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Configuration */}
      <div className="cathedral-surface p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-light text-[var(--text-primary)]">Pricing Tiers</h2>
          <button onClick={addTier}
            className="px-3 py-1.5 rounded-lg text-xs bg-teal-cathedral text-white hover:bg-teal-cathedral/90">
            + Add Tier
          </button>
        </div>

        <div className="space-y-4">
          {config.tiers.map((tier, idx) => (
            <div key={idx} className="rounded-lg border border-indigo-cathedral/10 p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[var(--text-primary)]">Tier {idx + 1}</span>
                {config.tiers.length > 1 && (
                  <button onClick={() => removeTier(idx)}
                    className="text-xs text-red-400 hover:text-red-600">Remove</button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Name</label>
                  <input type="text" value={tier.name} onChange={(e) => updateTier(idx, "name", e.target.value)}
                    className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Max Buyers</label>
                  <input type="number" value={tier.maxBuyers} onChange={(e) => updateTier(idx, "maxBuyers", e.target.value)}
                    min={1} max={100}
                    className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Base Price <span className="opacity-50">(cents)</span></label>
                  <div className="flex items-center gap-1">
                    <input type="number" value={tier.basePrice} onChange={(e) => updateTier(idx, "basePrice", e.target.value)}
                      min={0}
                      className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                    <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">{formatCents(tier.basePrice)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Hold Days</label>
                  <input type="number" value={tier.holdDays} onChange={(e) => updateTier(idx, "holdDays", e.target.value)}
                    min={0} max={30}
                    className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Drop Amount <span className="opacity-50">(cents)</span></label>
                  <div className="flex items-center gap-1">
                    <input type="number" value={tier.dropAmount} onChange={(e) => updateTier(idx, "dropAmount", e.target.value)}
                      min={0}
                      className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                    <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">{formatCents(tier.dropAmount)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Drop Interval <span className="opacity-50">(days)</span></label>
                  <input type="number" value={tier.dropInterval} onChange={(e) => updateTier(idx, "dropInterval", e.target.value)}
                    min={1} max={30}
                    className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-cathedral/25" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div className="cathedral-surface p-6 mb-6">
        <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">Live Preview</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Drag the slider to see how prices change over time with your current settings.
        </p>

        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs metallic-gold uppercase tracking-wider">Simulate Lead Age</span>
            <span className="text-sm text-[var(--text-primary)] font-mono">Day {simulateDay}</span>
          </div>
          <input type="range" min={0} max={30} value={simulateDay}
            onChange={(e) => setSimulateDay(parseInt(e.target.value))}
            className="w-full accent-teal-cathedral" />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
            <span>Day 0 (new)</span><span>Day 30</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {config.tiers.map((tier, idx) => {
            const t = simulateDay;
            const holding = t <= tier.holdDays;
            const steps = holding ? 0 : Math.floor((t - tier.holdDays) / (tier.dropInterval || 1));
            const price = Math.max(config.priceFloor, tier.basePrice - tier.dropAmount * steps);
            const pct = config.maxPrice > 0 ? Math.round((price / config.maxPrice) * 100) : 100;

            const colors = [
              { bg: "bg-indigo-50", text: "text-indigo-700", bar: "bg-indigo-400" },
              { bg: "bg-violet-50", text: "text-violet-700", bar: "bg-violet-400" },
              { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-400" },
              { bg: "bg-sky-50", text: "text-sky-700", bar: "bg-sky-400" },
              { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-400" },
              { bg: "bg-rose-50", text: "text-rose-700", bar: "bg-rose-400" },
            ];
            const c = colors[idx % colors.length];

            return (
              <div key={idx} className={`rounded-lg border border-indigo-cathedral/10 p-3 ${c.bg}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${c.text} mb-0.5`}>{tier.name}</p>
                <p className={`text-xl font-bold ${c.text}`}>{formatCents(price)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mb-2">
                  {tier.maxBuyers} buyer{tier.maxBuyers !== 1 ? "s" : ""} &middot;
                  {holding && tier.holdDays > 0 ? ` Holds ${tier.holdDays}d` : tier.dropAmount > 0 ? ` ${steps} drop${steps !== 1 ? "s" : ""}` : " Flat"}
                  &middot; floor {formatCents(config.priceFloor)}
                </p>
                <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full ${c.bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1 text-right">{pct}% of max</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Changes take effect immediately after saving.</p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 rounded-lg text-sm font-medium bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? "Saving..." : "Save Pricing Configuration"}
        </button>
      </div>
    </main>
  );
}
