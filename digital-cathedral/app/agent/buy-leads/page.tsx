"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalShell } from "../../components/portal-shell";

type Lead = {
  leadId: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  score: number;
  tier: string;
  createdAt: string;
  purchased: boolean;
  available: boolean;
  ageInDays?: number;
  tierPrices?: { name: string; price: number; soldOut: boolean }[];
};

const ageBand = (d: string) => {
  const h = (Date.now() - new Date(d).getTime()) / 36e5;
  return h < 24 ? "Today" : h < 72 ? "1–3 days" : "3+ days";
};

export default function Marketplace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState("");
  const [coverage, setCoverage] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (state) q.set("state", state);
    if (coverage) q.set("coverage", coverage);
    const r = await fetch(`/api/client/leads?${q}`);
    if (r.status === 401) {
      location.href = "/portal/login";
      return;
    }
    if (r.ok) setLeads((await r.json()).leads || []);
    setLoading(false);
  }, [state, coverage]);

  useEffect(() => {
    load();
  }, [load]);

  const options = useMemo(() => Array.from(new Set(leads.map((l) => l.coverageInterest))), [leads]);
  const available = leads.filter((l) => !l.purchased);

  return (
    <PortalShell
      role="agent"
      eyebrow="Find leads"
      title="Lead marketplace"
      description="Private contact details stay hidden until Stripe confirms your purchase."
    >
      <div className="flex flex-wrap gap-3 rounded-xl border border-[#e2d9c9] bg-white p-3">
        <input
          aria-label="State filter"
          maxLength={2}
          value={state}
          onChange={(e) => setState(e.target.value.toUpperCase())}
          placeholder="State (TX)"
          className="rounded-lg border border-[#e2d9c9] px-3 py-2"
        />
        <select
          value={coverage}
          onChange={(e) => setCoverage(e.target.value)}
          className="rounded-lg border border-[#e2d9c9] px-3 py-2"
        >
          <option value="">All coverage interests</option>
          {options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>

      {message && (
        <p role="status" className="mt-4 rounded-lg bg-[#e8f3f1] p-3 text-sm text-[#355d59]">
          {message}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-[#8a8175]">Loading available leads…</p>
        ) : available.length === 0 ? (
          <div className="rounded-2xl border border-[#e2d9c9] bg-white p-10 text-center">
            <b className="text-[#211d18]">No leads match these filters right now.</b>
            <p className="mt-2 text-sm text-[#8a8175]">Try adjusting your filters or check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {available.map((l) => {
              const t = l.tierPrices?.find((x) => !x.soldOut);
              return (
                <article key={l.leadId} className="rounded-2xl border border-[#e2d9c9] bg-white p-5 shadow-[0_8px_30px_rgba(39,32,20,0.05)]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-[#211d18]">
                      {l.state} · {l.coverageInterest}
                    </span>
                    <span className="rounded-full bg-[#e8f3f1] px-2 py-1 text-xs text-[#355d59]">{l.tier}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-[#776e61]">Readiness</dt>
                      <dd>{l.score >= 80 ? "Ready now" : l.score >= 60 ? "Exploring" : "Early research"}</dd>
                    </div>
                    <div>
                      <dt className="text-[#776e61]">Freshness</dt>
                      <dd>{ageBand(l.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#776e61]">Lead type</dt>
                      <dd>{l.veteranStatus || "Family"}</dd>
                    </div>
                    <div>
                      <dt className="text-[#776e61]">Price</dt>
                      <dd>{t ? `$${(t.price / 100).toFixed(0)}` : "Unavailable"}</dd>
                    </div>
                  </dl>
                  <button
                    disabled={!t || !l.available}
                    onClick={() =>
                      setMessage(
                        "Checkout uses the existing secure Stripe purchase flow. Open the established portal marketplace to choose an availability tier and complete payment.",
                      )
                    }
                    className="mt-5 w-full rounded-xl bg-[#176b65] px-4 py-3 font-semibold text-white disabled:opacity-40"
                  >
                    Purchase lead
                  </button>
                  <a href="/portal/marketplace" className="mt-2 block text-center text-xs text-[#176b65]">
                    Continue to secure checkout
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
