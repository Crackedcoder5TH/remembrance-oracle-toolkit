"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, PortalShell } from "../../components/portal-shell";

type State = {
  stripe: { checkoutConfigured: boolean; webhookConfigured: boolean; portalConfigured: boolean };
  email: { configured: boolean }; sms: { configured: boolean };
  webhooks: { configured: boolean; targets: string[] }; crm: { configured: boolean };
  developerApi: { configured: boolean }; notifications: { emailConfigured: boolean; smsConfigured: boolean };
};

export default function AdminIntegrations() {
  const [data, setData] = useState<State | null>(null);
  useEffect(() => { fetch("/api/admin/integrations", { cache: "no-store" }).then((r) => { if (r.status === 401) location.href = "/admin/login"; return r.json(); }).then(setData); }, []);
  const cards = data ? [
    ["Stripe", data.stripe.checkoutConfigured ? (data.stripe.webhookConfigured ? "Connected" : "Needs attention") : "Configuration required", data.stripe.checkoutConfigured ? `Checkout configured. Webhook ${data.stripe.webhookConfigured ? "configured" : "requires configuration"}. Customer Portal ${data.stripe.portalConfigured ? "configured" : "is not configured yet"}.` : "Stripe is not configured yet.", "/admin/payments"],
    ["Calendar", "Planned", "Internal appointments are active. External calendar sync is not connected.", "/admin/automations"],
    ["Email", data.email.configured ? "Connected" : "Configuration required", data.email.configured ? "Transactional email provider configuration is present." : "Email sending is not fully configured.", "/admin/notifications"],
    ["SMS", data.sms.configured ? "Connected" : "Configuration required", data.sms.configured ? "Twilio provider configuration is present for existing transactional workflows." : "SMS automation is not configured.", "/admin/notifications"],
    ["Webhooks", data.webhooks.configured ? "Connected" : "Configuration required", data.webhooks.configured ? `${data.webhooks.targets.length} signed delivery target(s) configured.` : "No signed webhook delivery target is configured.", "/admin/webhooks"],
    ["External CRM / Export", data.crm.configured ? "Connected" : "Not configured yet", data.crm.configured ? "The existing CRM webhook is configured." : "Admin export controls remain available; external CRM connection is not configured.", "/api/admin/export"],
    ["Developer API", data.developerApi.configured ? "Connected" : "Configuration required", data.developerApi.configured ? "Server-side agent API credentials are configured." : "Developer API credentials are not configured.", "/developers"],
    ["Notifications", data.notifications.emailConfigured || data.notifications.smsConfigured ? "Connected" : "Configuration required", "Provider status reflects server configuration only; no delivery history is fabricated.", "/admin/notifications"],
  ] : [];
  return <PortalShell role="admin" eyebrow="Operations" title="Integrations" description="Manage connected tools, billing portals, notifications, webhooks, and workflow automation settings for Valor Legacies operations.">
    {!data ? <p className="text-sm text-[#8a8175]">Checking server-side configuration…</p> : <div className="grid gap-4 md:grid-cols-2">{cards.map(([name,status,description,href]) => <Panel key={name} title={name}><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status === "Connected" ? "bg-emerald-50 text-emerald-700" : status === "Needs attention" ? "bg-amber-50 text-amber-800" : "bg-[#f4efe5] text-[#776e61]"}`}>{status}</span><p className="mt-4 min-h-12 text-sm leading-6 text-[#8a8175]">{description}</p><p className="mt-3 text-xs text-[#8a8175]">Last event: No persisted delivery history available.</p><Link href={href} className="mt-5 inline-flex rounded-lg bg-[#176b65] px-4 py-2 text-sm font-semibold text-white">View details</Link></Panel>)}</div>}
  </PortalShell>;
}
