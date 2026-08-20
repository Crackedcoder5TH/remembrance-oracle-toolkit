"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "../../../components/portal-shell";

type Lead = {
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  state: string;
  dateOfBirth: string;
  coverageInterest: string;
  purchaseIntent: string;
  veteranStatus: string;
  createdAt: string;
  consentSummary: string;
};

// A first-line script tuned to the reason the family reached out. Placeholder
// [Agent] is filled by the operator; the point is a warm, compliant opener.
const opener = (l: Lead) =>
  l.coverageInterest === "final-expense"
    ? `Hi ${l.firstName}, this is [Agent]. I’m following up because you requested information about final expense planning. My goal is to help you understand simple options that may help keep that burden off your family.`
    : l.coverageInterest.includes("mortgage")
      ? `Hi ${l.firstName}, this is [Agent]. I’m following up on your request about protecting your home. I’ll keep this simple and help you understand your options.`
      : l.veteranStatus?.includes("veteran")
        ? `Hi ${l.firstName}, this is [Agent]. I’m following up because you requested guidance as a veteran or military family member. My goal is to help you understand what benefits may cover and where private protection may help fill the gap.`
        : `Hi ${l.firstName}, this is [Agent]. I’m following up on your request for guidance. My job is to help you understand what protection may fit this chapter.`;

export default function LeadDetail({ params }: { params: { id: string } }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/client/leads/${encodeURIComponent(params.id)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        setLead(d.lead);
      })
      .catch((e) => setError(e.message));
  }, [params.id]);

  const body = () => {
    if (error)
      return <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p>;
    if (!lead) return <p className="text-sm text-[#8a8175]">Loading authorized lead…</p>;
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#176b65]">New · {lead.leadId}</p>
            <h2 className="font-serif text-3xl text-[#211d18]">
              {lead.firstName} {lead.lastName}
            </h2>
            <p className="text-[#8a8175]">
              {lead.state} · {lead.coverageInterest}
            </p>
          </div>
          <div className="flex gap-2">
            <a href={`tel:${lead.phone}`} className="rounded-xl bg-[#176b65] px-4 py-3 text-sm text-white">
              Call
            </a>
            <a href={`sms:${lead.phone}`} className="rounded-xl border border-[#e2d9c9] px-4 py-3 text-sm">
              Text
            </a>
            <a href={`mailto:${lead.email}`} className="rounded-xl border border-[#e2d9c9] px-4 py-3 text-sm">
              Email
            </a>
          </div>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5">
            <h3 className="font-semibold text-[#211d18]">Contact &amp; request</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-[#776e61]">Phone</dt><dd>{lead.phone}</dd></div>
              <div><dt className="text-[#776e61]">Email</dt><dd>{lead.email}</dd></div>
              <div><dt className="text-[#776e61]">DOB</dt><dd>{lead.dateOfBirth || "Not provided"}</dd></div>
              <div><dt className="text-[#776e61]">Readiness</dt><dd>{lead.purchaseIntent || "Exploring"}</dd></div>
              <div><dt className="text-[#776e61]">Submitted</dt><dd>{new Date(lead.createdAt).toLocaleString()}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5">
            <h3 className="font-semibold text-[#211d18]">Suggested opener</h3>
            <p className="mt-3 text-sm leading-6 text-[#4a4238]">“{opener(lead)}”</p>
          </section>
          <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5">
            <h3 className="font-semibold text-[#211d18]">Consent proof</h3>
            <p className="mt-3 text-sm">{lead.consentSummary}</p>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Honor contact preferences, identify yourself clearly, and stop outreach immediately after an opt-out.
            </p>
          </section>
          <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5">
            <h3 className="font-semibold text-[#211d18]">Activity &amp; follow-up</h3>
            <p className="mt-3 text-sm text-[#8a8175]">
              Purchase recorded. CRM notes, appointments, and status persistence require the Phase 3 operations fields.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Add note</button>
              <button className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Set follow-up</button>
              <button className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Update status</button>
            </div>
          </section>
        </div>
      </>
    );
  };

  return (
    <PortalShell
      role="agent"
      eyebrow="My Leads"
      title="Lead detail"
      description="Work this lead to the next step. Contact actions and consent are shown; CRM persistence arrives in Phase 3."
    >
      {body()}
    </PortalShell>
  );
}
