"use client";

import { useEffect, useState } from "react";
import { Panel, PortalShell } from "../../components/portal-shell";

type State = { webhooks: { configured: boolean; targets: string[] } };
const EVENTS = ["lead.created", "lead.reviewed", "lead.available", "lead.purchased", "lead.delivered", "lead.status_updated", "lead.note_added", "lead.followup_set", "lead.appointment_created", "lead.dnc_marked", "lead.optout_reported", "agent.approved", "agent.compliance_acknowledged", "payment.completed", "payment.failed", "dispute.opened", "privacy_request.opened"];

export default function WebhooksPage() {
  const [data, setData] = useState<State | null>(null);
  useEffect(() => { fetch("/api/admin/integrations", { cache: "no-store" }).then((r) => { if (r.status === 401) location.href = "/admin/login"; return r.json(); }).then(setData); }, []);
  return <PortalShell role="admin" eyebrow="Integrations" title="Webhooks & events" description="Inspect signed delivery configuration and the operational event vocabulary without exposing payload PII."><div className="grid gap-5 xl:grid-cols-2">
    <Panel title="Delivery health">{!data ? <p className="text-sm text-[#8a8175]">Checking configuration…</p> : data.webhooks.configured ? <><p className="text-sm font-semibold text-emerald-700">Signed lead.created delivery is configured.</p><div className="mt-4 space-y-2">{data.webhooks.targets.map((target) => <p key={target} className="break-all rounded-lg bg-[#f4efe5] p-3 font-mono text-xs">{target}</p>)}</div><p className="mt-4 text-sm text-[#8a8175]">Attempt history, success timestamps, failure counts, payload previews, and manual retries are not persisted by the current delivery implementation.</p></> : <p className="rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-5 text-sm text-[#8a8175]">No signed webhook target is configured. No webhook events have been recorded yet.</p>}</Panel>
    <Panel title="Available event vocabulary"><div className="flex flex-wrap gap-2">{EVENTS.map((event) => <code key={event} className="rounded-lg border border-[#e2d9c9] bg-[#faf8f3] px-2 py-1 text-xs">{event}</code>)}</div><p className="mt-4 text-sm text-[#8a8175]"><strong>Implemented delivery:</strong> lead.created only. Remaining names define the future event foundation and are not claimed as delivered.</p></Panel>
    <div className="xl:col-span-2"><Panel title="Payload & signing principles"><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#8a8175]"><li>Existing outbound delivery uses an HMAC signature and timestamp.</li><li>Targets and secrets remain server-side; only authenticated admins see redacted configuration state.</li><li>Future logs must redact contact details, birth dates, consent evidence, tokens, and payment details.</li><li>Retries cannot be offered until durable delivery attempts and idempotency are implemented.</li></ul></Panel></div>
  </div></PortalShell>;
}
