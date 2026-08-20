"use client";

import { useEffect, useState } from "react";
import { PortalShell } from "../../../components/portal-shell";

type Detail = {
  lead: Record<string, string | boolean | null>;
  purchases: Array<{ purchaseId: string; clientId: string; pricePaid: number; purchasedAt: string; status: string }>;
};

export default function AdminLeadDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/leads/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          location.href = "/admin/login";
          return;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [params.id]);

  const body = () => {
    if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</p>;
    if (!data) return <p className="text-sm text-[#8a8175]">Loading lead…</p>;
    const l = data.lead;
    const fullName = `${l.firstName ?? ""} ${l.lastName ?? ""}`;
    return (
      <>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#176b65]">
              {data.purchases.length ? "Purchased" : "New"} · {String(l.leadId)}
            </p>
            <h2 className="font-serif text-3xl text-[#211d18]">{fullName}</h2>
            <p className="text-[#8a8175]">
              {String(l.state)} · {String(l.coverageInterest)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Mark reviewed</button>
            <button className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Make available</button>
            <button className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700">Do not contact</button>
          </div>
        </header>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <Card title="Contact">
            <Row k="Email" v={l.email} />
            <Row k="Phone" v={l.phone} />
            <Row k="DOB" v={l.dateOfBirth} />
            <Row k="State" v={l.state} />
          </Card>
          <Card title="Request">
            <Row k="Coverage interest" v={l.coverageInterest} />
            <Row k="Readiness" v={l.purchaseIntent} />
            <Row k="Life chapter" v={l.veteranStatus} />
            <Row k="Submitted" v={l.createdAt} />
          </Card>
          <Card title="Source & campaign">
            <Row k="Source" v={l.utmSource} />
            <Row k="Medium" v={l.utmMedium} />
            <Row k="Campaign" v={l.utmCampaign} />
            <Row k="Page" v={l.consentPageUrl} />
          </Card>
          <Card title="Compliance proof">
            <Row k="TCPA consent" v={l.consentTcpa ? "Recorded" : "Missing"} />
            <Row k="Privacy consent" v={l.consentPrivacy ? "Recorded" : "Missing"} />
            <Row k="Timestamp" v={l.consentTimestamp} />
            <Row k="IP" v={l.consentIp} />
            <Row k="User agent" v={l.consentUserAgent} />
            <p className="mt-3 whitespace-pre-wrap rounded bg-[#f4efe5] p-3 text-xs text-[#4a4238]">
              {String(l.consentText || "No snapshot stored")}
            </p>
          </Card>
          <Card title="Purchase history">
            {data.purchases.length ? (
              data.purchases.map((p) => (
                <p key={p.purchaseId} className="border-b border-[#e2d9c9] py-2 text-sm">
                  {p.clientId} · ${(p.pricePaid / 100).toFixed(2)} · {p.status} · {new Date(p.purchasedAt).toLocaleString()}
                </p>
              ))
            ) : (
              <p className="text-sm text-[#8a8175]">Not sold or assigned.</p>
            )}
          </Card>
          <Card title="Activity & internal notes">
            <p className="text-sm text-[#8a8175]">
              Submission and purchase events are shown from existing records. Operational status, notes, assignments, and
              follow-up fields are not yet present in the database.
            </p>
            <button className="mt-4 rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm">Add internal note</button>
          </Card>
        </div>
      </>
    );
  };

  return (
    <PortalShell
      role="admin"
      eyebrow="Leads"
      title="Lead detail"
      description="Full contact, source, and compliance record with purchase history. Operational fields arrive in Phase 3."
    >
      {body()}
    </PortalShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5">
      <h3 className="mb-4 text-lg text-[#211d18]">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="mb-2 grid grid-cols-[9rem_1fr] gap-2 text-sm">
      <span className="text-[#776e61]">{k}</span>
      <span className="break-all">{v ? String(v) : "—"}</span>
    </div>
  );
}
