import { Panel, PortalShell } from "../../components/portal-shell";

const RULES = [
  ["Block contact when lead is DNC", "Lead status becomes Do Not Contact", "Disable call, text, and email actions", "Active system rule"],
  ["Notify agent of delivered lead", "Lead purchase is fulfilled", "Create an in-app notification", "Configuration required"],
  ["Surface follow-up due", "Follow-up enters its due window", "Show agent reminder", "Active system rule"],
  ["Surface appointment today", "Appointment enters today’s window", "Show agent reminder", "Active system rule"],
  ["Consent gap alert", "Required consent is absent", "Notify admin and block purchase", "Planned"],
  ["Payment failure alert", "Stripe payment fails", "Notify admin", "Configuration required"],
  ["Opt-out escalation", "Agent reports an opt-out", "Notify admin and block outreach", "Active system rule"],
];

export default function AutomationsPage() { return <PortalShell role="admin" eyebrow="Operations" title="Workflow automations" description="Review conservative system rules and the foundation for future editable workflows."><div className="grid gap-4 md:grid-cols-2">{RULES.map(([name,trigger,action,status]) => <Panel key={name} title={name}><span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.startsWith("Active") ? "bg-emerald-50 text-emerald-700" : "bg-[#f4efe5] text-[#776e61]"}`}>{status}</span><dl className="mt-4 space-y-3 text-sm"><div><dt className="font-semibold text-[#776e61]">Trigger</dt><dd className="mt-1 text-[#8a8175]">{trigger}</dd></div><div><dt className="font-semibold text-[#776e61]">Action</dt><dd className="mt-1 text-[#8a8175]">{action}</dd></div><div><dt className="font-semibold text-[#776e61]">Last run</dt><dd className="mt-1 text-[#8a8175]">No persisted run history.</dd></div></dl></Panel>)}</div><p className="mt-5 rounded-xl border border-[#e2d9c9] bg-white p-5 text-sm text-[#8a8175]">Editable automations can be added in a future phase. Rules shown as planned or configuration required do not execute.</p></PortalShell>; }
