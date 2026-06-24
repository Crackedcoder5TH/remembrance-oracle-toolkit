import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  getNotificationRecipients,
  setNotificationRecipients,
  getLeadNotificationTargets,
  getEnvAdminEmails,
} from "@/app/lib/notification-recipients";
import { sendEmail } from "@/app/lib/email";

export const dynamic = "force-dynamic";

/**
 * Lead-notification recipients admin API.
 *
 *   GET  — current managed list + the env ADMIN_EMAIL fallback (read-only).
 *   PUT  — replace the managed list ({ recipients: string[] }).
 *   POST — send a test notification to every current target.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  return NextResponse.json({
    success: true,
    recipients: await getNotificationRecipients(),
    envAdminEmails: getEnvAdminEmails(),
    smtpConfigured: Boolean(process.env.SMTP_HOST),
  });
}

export async function PUT(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  let body: { recipients?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json(
      { success: false, message: "Body must be { recipients: string[] }." },
      { status: 400 },
    );
  }

  const result = await setNotificationRecipients(body.recipients.map(String));
  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: result.error || "Failed to save recipients." },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true, recipients: result.recipients });
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const targets = await getLeadNotificationTargets();
  if (targets.length === 0) {
    return NextResponse.json(
      { success: false, message: "No recipients configured yet — add one and save first." },
      { status: 400 },
    );
  }

  const fromAddress = process.env.EMAIL_FROM || "noreply@valorlegacies.com";
  const companyName = process.env.COMPANY_NAME || "Valor Legacies";
  const subject = `Test — ${companyName} lead notifications`;
  const text =
    "This is a test of your new-lead notifications. If you received this, alerts are wired correctly.";
  const html = `<p>This is a <strong>test</strong> of your new-lead notifications.</p><p>If you received this, alerts are wired correctly.</p>`;

  const results = await Promise.allSettled(
    targets.map((to) => sendEmail({ to, from: fromAddress, subject, text, html })),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  const smtpConfigured = Boolean(process.env.SMTP_HOST);

  return NextResponse.json({
    success: true,
    sent,
    failed,
    targets,
    smtpConfigured,
    note: smtpConfigured
      ? undefined
      : "SMTP is not configured (SMTP_HOST unset) — emails are logged to the server console, not delivered. Set SMTP_HOST/USER/PASS in Vercel to send for real.",
  });
}
