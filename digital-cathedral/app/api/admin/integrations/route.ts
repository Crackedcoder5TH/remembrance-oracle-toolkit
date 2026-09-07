import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const webhookUrls = (process.env.WEBHOOK_URLS ?? "").split(",").map((url) => url.trim()).filter(Boolean);
  return NextResponse.json({
    stripe: {
      checkoutConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      portalConfigured: Boolean(process.env.STRIPE_CUSTOMER_PORTAL_URL),
    },
    email: { configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) },
    sms: { configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) },
    webhooks: {
      configured: webhookUrls.length > 0 && Boolean(process.env.WEBHOOK_SECRET),
      targets: webhookUrls.map((value) => {
        try { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; } catch { return "Invalid configured URL"; }
      }),
    },
    crm: { configured: Boolean(process.env.CRM_WEBHOOK_URL) },
    developerApi: { configured: Boolean(process.env.AGENT_API_KEYS) },
    notifications: { emailConfigured: Boolean(process.env.SMTP_HOST), smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID) },
  });
}
