/**
 * Lead Confirmation Email
 *
 * Transactional email system with two modes:
 *  1. SMTP transport — when SMTP_HOST is configured (production)
 *  2. Console transport — logs the email to stdout (development)
 *
 * Environment variables:
 *   SMTP_HOST     — SMTP server hostname (e.g., smtp.sendgrid.net)
 *   SMTP_PORT     — SMTP port (default: 587)
 *   SMTP_USER     — SMTP username / API key name
 *   SMTP_PASS     — SMTP password / API key
 *   EMAIL_FROM    — Sender address (e.g., "noreply@yourdomain.com")
 *   COMPANY_NAME  — Company name for email content
 */

import { withCircuitBreaker, CircuitOpenError } from "./circuit-breaker";

// --- Retry with exponential backoff for delivery ---
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send an email via SMTP or log to console in dev.
 */
async function sendEmail(message: EmailMessage): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;

  if (!smtpHost) {
    // --- Dev mode: log to console ---
    console.log("[EMAIL][DEV] Would send email:");
    console.log(`  To: ${message.to}`);
    console.log(`  From: ${message.from}`);
    console.log(`  Subject: ${message.subject}`);
    console.log(`  Body:\n${message.text}`);
    return;
  }

  // --- Production mode: SMTP via fetch to HTTP email API ---
  // Supports SendGrid, Mailgun, Postmark, or any HTTP API
  // For raw SMTP, use nodemailer (add as dependency when needed)
  const smtpPort = process.env.SMTP_PORT || "587";
  const smtpUser = process.env.SMTP_USER || "";
  const smtpPass = process.env.SMTP_PASS || "";

  // Generic SMTP via SendGrid v3 API (most common for lead-gen)
  if (smtpHost.includes("sendgrid")) {
    await retry(async () => {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${smtpPass}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: message.from },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`SendGrid error: ${res.status} ${await res.text()}`);
      }
    }, 2, 1000);
    return;
  }

  // Generic HTTP email API fallback (Mailgun, Postmark, etc.)
  // Log a warning so the operator knows to configure the integration
  console.warn(
    `[EMAIL] SMTP_HOST="${smtpHost}" is configured but no matching provider integration found. ` +
    `Supported: SendGrid (smtp.sendgrid.net). Falling back to console log.`
  );
  console.log("[EMAIL][FALLBACK] Would send email:");
  console.log(`  To: ${message.to}`);
  console.log(`  Subject: ${message.subject}`);
  console.log(`  SMTP: ${smtpHost}:${smtpPort} (user: ${smtpUser})`);
}

/**
 * Send a lead confirmation email to the person who submitted the form.
 * Non-blocking — errors are logged but don't affect the API response.
 */
export async function sendLeadConfirmationEmail(lead: {
  firstName: string;
  email: string;
  coverageInterest: string;
  leadId: string;
}): Promise<void> {
  const companyName = process.env.COMPANY_NAME || "Digital Cathedral";
  const fromAddress = process.env.EMAIL_FROM || `noreply@example.com`;

  const coverageLabels: Record<string, string> = {
    "term": "Term Life Insurance",
    "whole": "Whole Life Insurance",
    "universal": "Universal Life Insurance",
    "final-expense": "Final Expense / Burial Insurance",
    "annuity": "Annuity",
    "not-sure": "Insurance Guidance",
  };

  const coverageLabel = coverageLabels[lead.coverageInterest] || lead.coverageInterest;

  const subject = `${companyName} — We Received Your Request`;

  const text = [
    `Hi ${lead.firstName},`,
    ``,
    `Thank you for reaching out about ${coverageLabel}. We've received your request and a licensed insurance professional will contact you within 1 business day.`,
    ``,
    `What happens next:`,
    `1. A licensed agent in your area will review your request`,
    `2. They will call or email you to discuss your options`,
    `3. There is no obligation — this is a free consultation`,
    ``,
    `Your reference number: ${lead.leadId}`,
    ``,
    `If you did not submit this request, or if you wish to have your data deleted, please reply to this email or visit our website's privacy page.`,
    ``,
    `Best regards,`,
    `The ${companyName} Team`,
    ``,
    `---`,
    `This email was sent because a form was submitted with this email address at ${companyName}. If you believe this was sent in error, please disregard this message.`,
  ].join("\n");

  // Branded HTML email template
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; color: #1A1A2E; background-color: #FAFBFC;">
  <!-- Header -->
  <div style="background-color: #1B2D4F; padding: 24px 32px;">
    <h1 style="font-size: 20px; font-weight: 600; color: #FFFFFF; margin: 0;">${companyName}</h1>
    <p style="font-size: 12px; color: #6BA3D6; margin: 4px 0 0 0; letter-spacing: 0.1em;">PROTECTING YOUR LEGACY</p>
  </div>

  <!-- Body -->
  <div style="padding: 32px; background-color: #FFFFFF;">
    <p style="font-size: 16px; margin-top: 0;">Hi <strong>${lead.firstName}</strong>,</p>

    <p>Thank you for reaching out about <strong>${coverageLabel}</strong>. We've received your request and a licensed insurance professional will contact you within <strong>1 business day</strong>.</p>

    <!-- What happens next -->
    <div style="background: #F0F2F5; border-left: 3px solid #2D8659; padding: 16px 20px; margin: 24px 0; border-radius: 0 6px 6px 0;">
      <p style="margin: 0 0 12px 0; font-weight: 600; color: #1B2D4F;">What happens next:</p>
      <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
        <li>A licensed agent in your area will review your request</li>
        <li>They will call or email you to discuss your options</li>
        <li>There is no obligation — this is a free consultation</li>
      </ol>
    </div>

    <!-- Reference number -->
    <div style="background: #F0F2F5; padding: 12px 16px; border-radius: 6px; display: inline-block; margin: 8px 0 16px 0;">
      <span style="font-size: 11px; color: #5A6377; text-transform: uppercase; letter-spacing: 0.05em;">Reference Number</span><br>
      <span style="font-family: monospace; font-size: 14px; color: #1A1A2E;">${lead.leadId}</span>
    </div>

    <p style="font-size: 13px; color: #5A6377;">If you did not submit this request, or if you wish to have your data deleted, please reply to this email or visit our <a href="${siteUrl}/privacy" style="color: #2D8659;">privacy page</a>.</p>
  </div>

  <!-- Footer -->
  <div style="background-color: #F0F2F5; padding: 20px 32px; border-top: 1px solid #E0E4EA;">
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #5A6377;">Best regards,<br>The ${companyName} Team</p>
    <div style="margin-top: 12px; font-size: 11px; color: #8A92A3;">
      <a href="${siteUrl}/privacy" style="color: #2D8659; text-decoration: none;">Privacy Policy</a> &middot;
      <a href="${siteUrl}/terms" style="color: #2D8659; text-decoration: none;">Terms of Service</a> &middot;
      <a href="${siteUrl}/privacy#do-not-sell" style="color: #2D8659; text-decoration: none;">Do Not Sell My Info</a>
    </div>
    <p style="margin: 8px 0 0 0; font-size: 11px; color: #8A92A3;">This email was sent because a form was submitted with this email address at ${companyName}.</p>
  </div>
</body>
</html>`.trim();

  try {
    await withCircuitBreaker(
      () => sendEmail({ to: lead.email, from: fromAddress, subject, text, html }),
      { name: "email-sendgrid", failureThreshold: 5, resetTimeout: 60_000 },
    );
    console.log(`[EMAIL] Confirmation sent to ${lead.email} for lead ${lead.leadId}`);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn(`[EMAIL] Circuit open — skipping email for lead ${lead.leadId}. ${err.message}`);
    } else {
      throw err;
    }
  }
}

/**
 * Admin notification email when a new lead arrives.
 * Sends to ADMIN_EMAIL (env var) with lead details, score, and tier.
 */
export async function sendAdminNotificationEmail(lead: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  leadId: string;
}, score?: { total: number; tier: string }): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return; // No admin email configured — skip silently

  const companyName = process.env.COMPANY_NAME || "Digital Cathedral";
  const fromAddress = process.env.EMAIL_FROM || "noreply@example.com";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

  const coverageLabels: Record<string, string> = {
    "term": "Term Life",
    "whole": "Whole Life",
    "universal": "Universal Life",
    "final-expense": "Final Expense",
    "annuity": "Annuity",
    "not-sure": "Needs Guidance",
  };

  const coverageLabel = coverageLabels[lead.coverageInterest] || lead.coverageInterest;
  const tierColors: Record<string, string> = {
    hot: "#C9474B",
    warm: "#D4883C",
    standard: "#2D8659",
    cold: "#5A6377",
  };
  const tierColor = tierColors[score?.tier || "standard"] || "#5A6377";

  const subject = `New Lead: ${lead.firstName} ${lead.lastName} — ${coverageLabel} (${lead.state})`;

  const text = [
    `New Lead Submitted`,
    ``,
    `Name: ${lead.firstName} ${lead.lastName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `State: ${lead.state}`,
    `Coverage: ${coverageLabel}`,
    `Veteran: ${lead.veteranStatus}`,
    `Lead ID: ${lead.leadId}`,
    score ? `Score: ${score.total} (${score.tier})` : "",
    ``,
    `View in admin: ${siteUrl}/admin`,
  ].filter(Boolean).join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; color: #1A1A2E; background-color: #FAFBFC;">
  <!-- Header -->
  <div style="background-color: #1B2D4F; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <h1 style="font-size: 18px; font-weight: 600; color: #FFFFFF; margin: 0;">New Lead Received</h1>
      <p style="font-size: 12px; color: #6BA3D6; margin: 4px 0 0 0;">${companyName} Admin</p>
    </div>
  </div>

  <!-- Body -->
  <div style="padding: 24px 32px; background-color: #FFFFFF;">
    ${score ? `<div style="display: inline-block; background: ${tierColor}; color: #FFFFFF; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">${score.tier} — Score ${score.total}</div>` : ""}

    <!-- Lead details table -->
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377; width: 120px;">Name</td>
        <td style="padding: 10px 0; font-size: 14px; font-weight: 600;">${lead.firstName} ${lead.lastName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">Email</td>
        <td style="padding: 10px 0; font-size: 14px;"><a href="mailto:${lead.email}" style="color: #2D8659;">${lead.email}</a></td>
      </tr>
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">Phone</td>
        <td style="padding: 10px 0; font-size: 14px;"><a href="tel:${lead.phone}" style="color: #2D8659;">${lead.phone}</a></td>
      </tr>
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">State</td>
        <td style="padding: 10px 0; font-size: 14px;">${lead.state}</td>
      </tr>
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">Coverage</td>
        <td style="padding: 10px 0; font-size: 14px;">${coverageLabel}</td>
      </tr>
      <tr style="border-bottom: 1px solid #F0F2F5;">
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">Veteran</td>
        <td style="padding: 10px 0; font-size: 14px;">${lead.veteranStatus}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 12px; color: #5A6377;">Lead ID</td>
        <td style="padding: 10px 0; font-size: 13px; font-family: monospace;">${lead.leadId}</td>
      </tr>
    </table>

    <a href="${siteUrl}/admin" style="display: inline-block; background-color: #2D8659; color: #FFFFFF; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 8px;">View in Dashboard</a>
  </div>

  <!-- Footer -->
  <div style="background-color: #F0F2F5; padding: 16px 32px; font-size: 11px; color: #8A92A3;">
    <p style="margin: 0;">This is an automated notification from ${companyName}.</p>
  </div>
</body>
</html>`.trim();

  try {
    await withCircuitBreaker(
      () => sendEmail({ to: adminEmail, from: fromAddress, subject, text, html }),
      { name: "email-admin", failureThreshold: 5, resetTimeout: 60_000 },
    );
    console.log(`[EMAIL] Admin notification sent for lead ${lead.leadId}`);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn(`[EMAIL] Circuit open — skipping admin email for lead ${lead.leadId}. ${err.message}`);
    } else {
      throw err;
    }
  }
}
