"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PortalShell, Panel } from "../../components/portal-shell";

type Lead = {
  leadId: string;
  firstName?: string;
  lastName?: string;
  state: string;
  coverageInterest: string;
  tier: string;
  createdAt: string;
  purchased: boolean;
  phone?: string;
  email?: string;
  status?: string;
  nextFollowUpAt?: string | null;
  appointmentAt?: string | null;
};

export default function MyLeads() {
  const [all, setAll] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/client/leads?limit=100")
      .then((r) => {
        if (r.status === 401) location.href = "/portal/login";
        return r.json();
      })
      .then((d) => setAll((d.leads || []).filter((l: Lead) => l.purchased)))
      .finally(() => setLoading(false));
  }, []);

  const leads = useMemo(
    () =>
      all.filter(
        (l) =>
          (!state || l.state === state) &&
          (!q || `${l.firstName} ${l.lastName} ${l.leadId}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [all, q, state],
  );

  return (
    <PortalShell
      role="agent"
      eyebrow="Daily work hub"
      title="My Leads"
      description="Your purchased and assigned leads. Call, text, and work each one to the next step."
    >
      <Panel title="Find a lead">
        <div className="flex flex-wrap gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or lead ID"
            className="min-w-0 flex-1 rounded-lg border border-[#e2d9c9] px-3 py-2"
          />
          <input
            value={state}
            maxLength={2}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            placeholder="State"
            className="w-24 rounded-lg border border-[#e2d9c9] px-3 py-2"
          />
        </div>
      </Panel>

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-[#8a8175]">Loading your leads…</p>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-[#e2d9c9] bg-white p-10 text-center">
            <b className="text-[#211d18]">You do not have any leads yet.</b>
            <p className="mt-2 text-sm text-[#8a8175]">
              Visit the marketplace to find leads that match your licensed states and focus areas.
            </p>
            <Link
              href="/agent/buy-leads"
              className="mt-5 inline-block rounded-xl bg-[#176b65] px-5 py-3 text-sm font-semibold text-white"
            >
              Visit marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((l) => (
              <article key={l.leadId} className="rounded-xl border border-[#e2d9c9] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <b className="text-[#211d18]">
                      {l.firstName} {l.lastName}
                    </b>
                    <p className="text-sm text-[#8a8175]">
                      {l.state} · {l.coverageInterest} · {l.status || "New"}
                    </p>
                    <p className="mt-1 text-xs text-[#8a8175]">Follow-up: {l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleString() : "Not set"} · Appointment: {l.appointmentAt ? new Date(l.appointmentAt).toLocaleString() : "Not set"}</p>
                  </div>
                  <div className="flex gap-2">
                    <a className={`rounded-lg border border-[#e2d9c9] px-4 py-3 text-sm ${!l.phone ? "pointer-events-none opacity-50" : ""}`} href={l.phone ? `tel:${l.phone}` : undefined} aria-disabled={!l.phone} title={!l.phone ? "No phone number available" : undefined}>
                      Call
                    </a>
                    <a className={`rounded-lg border border-[#e2d9c9] px-4 py-3 text-sm ${!l.phone ? "pointer-events-none opacity-50" : ""}`} href={l.phone ? `sms:${l.phone}` : undefined} aria-disabled={!l.phone} title={!l.phone ? "No phone number available" : undefined}>
                      Text
                    </a>
                    <Link
                      className="rounded-lg bg-[#176b65] px-3 py-2 text-sm text-white"
                      href={`/agent/leads/${l.leadId}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
