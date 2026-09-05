"use client";

import { useEffect, useState } from "react";
import { Panel, PortalShell } from "../../../components/portal-shell";

type Detail = {
  lead: Record<string, string | boolean | null>;
  purchases: Array<{ purchaseId: string; clientId: string; pricePaid: number; purchasedAt: string; status: string }>;
  operations: { status: string; lastContactedAt: string | null; nextFollowUpAt: string | null; appointmentAt: string | null; doNotContact: boolean; disputeStatus: string | null; notes: Array<{id:number;body:string;actorRole:string;visibility:string;createdAt:string}>; activity: Array<{id:number;eventLabel:string;actorRole:string;createdAt:string}> };
  compliance: { suppressed: boolean; reviewed: boolean; privacyRequests: Array<{id:number;requestType:string;status:string}> };
};

export default function AdminLeadDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function complianceAction(action: "review" | "dnc") {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/compliance", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({action,leadId:params.id}) });
    const result = await response.json();
    if (!response.ok) setError(result.message); else location.reload();
    setBusy(false);
  }

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
            <button disabled={busy||data.compliance.reviewed} onClick={()=>complianceAction("review")} className="rounded-lg border border-[#e2d9c9] px-3 py-2 text-sm disabled:opacity-50">{data.compliance.reviewed?"Compliance reviewed":"Mark compliance reviewed"}</button>
            <button disabled={busy||data.operations.doNotContact} onClick={()=>complianceAction("dnc")} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50">Do not contact</button>
          </div>
        </header>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <Panel title="Contact">
            <Row k="Email" v={l.email} />
            <Row k="Phone" v={l.phone} />
            <Row k="DOB" v={l.dateOfBirth} />
            <Row k="State" v={l.state} />
          </Panel>
          <Panel title="Request">
            <Row k="Coverage interest" v={l.coverageInterest} />
            <Row k="Readiness" v={l.purchaseIntent} />
            <Row k="Life chapter" v={l.veteranStatus} />
            <Row k="Submitted" v={l.createdAt} />
          </Panel>
          <Panel title="Source & campaign">
            <Row k="Source" v={l.utmSource} />
            <Row k="Medium" v={l.utmMedium} />
            <Row k="Campaign" v={l.utmCampaign} />
            <Row k="Page" v={l.consentPageUrl} />
          </Panel>
          <Panel title="Compliance proof">
            <Row k="TCPA consent" v={l.consentTcpa ? "Recorded" : "Missing"} />
            <Row k="Privacy consent" v={l.consentPrivacy ? "Recorded" : "Missing"} />
            <Row k="Timestamp" v={l.consentTimestamp} />
            <Row k="IP" v={l.consentIp} />
            <Row k="User agent" v={l.consentUserAgent} />
            <Row k="Suppression match" v={data.compliance.suppressed ? "Matched — contact restricted" : "No active match"} />
            <Row k="Privacy requests" v={data.compliance.privacyRequests.length ? data.compliance.privacyRequests.map(r=>`${r.requestType}: ${r.status}`).join(", ") : "None"} />
            <Row k="Compliance review" v={data.compliance.reviewed ? "Reviewed" : "Action needed"} />
            <p className="mt-3 whitespace-pre-wrap rounded bg-[#f4efe5] p-3 text-xs text-[#4a4238]">
              {String(l.consentText || "No snapshot stored")}
            </p>
          </Panel>
          <Panel title="Purchase history">
            {data.purchases.length ? (
              data.purchases.map((p) => (
                <p key={p.purchaseId} className="border-b border-[#e2d9c9] py-2 text-sm">
                  {p.clientId} · ${(p.pricePaid / 100).toFixed(2)} · {p.status} · {new Date(p.purchasedAt).toLocaleString()}
                </p>
              ))
            ) : (
              <p className="text-sm text-[#8a8175]">Not sold or assigned.</p>
            )}
          </Panel>
          <Panel title="Activity & internal notes">
            <Row k="Agent status" v={data.operations.status} /><Row k="Last contacted" v={data.operations.lastContactedAt} /><Row k="Follow-up" v={data.operations.nextFollowUpAt} /><Row k="Appointment" v={data.operations.appointmentAt} /><Row k="Dispute" v={data.operations.disputeStatus} /><Row k="Do not contact" v={data.operations.doNotContact ? "Yes" : "No"} />
            <div className="mt-4 space-y-2">{data.operations.notes.length ? data.operations.notes.map(n=><div key={n.id} className="rounded-lg bg-[#f4efe5] p-3 text-sm"><p>{n.body}</p><p className="mt-1 text-xs text-[#8a8175]">{n.actorRole} · {n.visibility} · {new Date(n.createdAt).toLocaleString()}</p></div>) : <p className="text-sm text-[#8a8175]">No notes recorded.</p>}</div>
          </Panel>
          <Panel title="Activity timeline">
            <div className="space-y-3">{data.operations.activity.length ? data.operations.activity.map(a=><div key={a.id} className="border-l-2 border-[#c9a75f] pl-3 text-sm"><p>{a.eventLabel}</p><p className="text-xs text-[#8a8175]">{a.actorRole} · {new Date(a.createdAt).toLocaleString()}</p></div>) : <p className="text-sm text-[#8a8175]">No operational activity recorded yet.</p>}</div>
          </Panel>
        </div>
      </>
    );
  };

  return (
    <PortalShell
      role="admin"
      eyebrow="Leads"
      title="Lead detail"
      description="Full contact, compliance, purchase history, and persisted operational activity."
    >
      {body()}
    </PortalShell>
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
