/**
 * Twilio SMS Integration
 *
 * Sends SMS notifications via the Twilio REST API (no SDK — just fetch).
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID  — Twilio Account SID
 *   TWILIO_AUTH_TOKEN   — Twilio Auth Token
 *   TWILIO_FROM_NUMBER  — Twilio phone number to send from (E.164 format)
 *   ADMIN_PHONE         — Admin phone number for lead alerts (optional)
 */

// --- Retry with exponential backoff ---
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

/** Coverage labels for SMS messages */
const COVERAGE_LABELS: Record<string, string> = {
  term: "Term Life Insurance",
  whole: "Whole Life Insurance",
  universal: "Universal Life Insurance",
  "final-expense": "Final Expense Insurance",
  annuity: "Annuity",
  "not-sure": "insurance coverage",
};

/**
 * Send an SMS via the Twilio REST API.
 *
 * If TWILIO_ACCOUNT_SID is not set, logs the message to console (dev mode).
 */
async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid) {
    console.log("[SMS][DEV] Would send SMS:");
    console.log(`  To: ${to}`);
    console.log(`  From: ${fromNumber || "(not configured)"}`);
    console.log(`  Body: ${body}`);
    return;
  }

  if (!authToken || !fromNumber) {
    console.warn(
      "[SMS] TWILIO_ACCOUNT_SID is set but TWILIO_AUTH_TOKEN or TWILIO_FROM_NUMBER is missing. Skipping SMS.",
    );
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  await retry(async () => {
    const params = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: body,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Twilio API error: ${res.status} ${errorBody}`);
    }
  }, 2, 1000);
}

/**
 * Send a confirmation SMS to the lead who submitted the form.
 * Non-blocking — errors are logged but don't affect the API response.
 */
export async function sendLeadSms(lead: {
  firstName: string;
  phone: string;
  coverageInterest: string;
  leadId: string;
}): Promise<void> {
  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;

  const body =
    `Hi ${lead.firstName}, thank you for your interest in ${coverageLabel}. ` +
    `A licensed professional will contact you within 1 business day. ` +
    `Ref: ${lead.leadId} — Valor Legacies`;

  try {
    await sendSms(lead.phone, body);
    console.log(`[SMS] Lead confirmation sent to ${lead.phone} for lead ${lead.leadId}`);
  } catch (err) {
    console.error(`[SMS] Failed to send lead SMS for ${lead.leadId}:`, err);
    throw err;
  }
}

/**
 * Send an admin alert SMS when a new lead arrives.
 * Non-blocking — errors are logged but don't affect the API response.
 */
export async function sendAdminSms(
  lead: {
    firstName: string;
    lastName: string;
    phone: string;
    state: string;
    coverageInterest: string;
  },
  adminPhone: string,
): Promise<void> {
  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;

  const body =
    `New lead: ${lead.firstName} ${lead.lastName} (${lead.state}) — ${coverageLabel}. ` +
    `Phone: ${lead.phone}`;

  try {
    await sendSms(adminPhone, body);
    console.log(`[SMS] Admin alert sent to ${adminPhone} for lead ${lead.firstName} ${lead.lastName}`);
  } catch (err) {
    console.error(`[SMS] Failed to send admin SMS:`, err);
    throw err;
  }
}
