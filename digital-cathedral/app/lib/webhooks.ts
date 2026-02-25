/**
 * Lead Notification Webhook System — Kingdom Messengers
 *
 * Oracle patterns used:
 *  - retry-async (PULL, coherency 1.000) — exponential backoff for delivery
 *  - result-type-ts (EVOLVE, coherency 1.000) — typed error handling
 *
 * Webhooks are configured via environment variables:
 *   WEBHOOK_URLS — comma-separated list of endpoint URLs
 *   WEBHOOK_SECRET — shared secret for HMAC signature verification
 *
 * Each lead submission fires a POST to all configured endpoints with:
 *  - JSON payload of the lead data
 *  - X-Webhook-Signature header (HMAC-SHA256)
 *  - X-Webhook-Event header ("lead.created")
 *  - Retry with exponential backoff (3 attempts)
 */
import { createHmac } from "crypto";

// --- Oracle-pulled: retry-async (coherency 1.000, PULL) ---
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
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

// --- Evolved from oracle pattern: result-type-ts ---
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export interface WebhookPayload {
  event: "lead.created";
  timestamp: string;
  data: {
    leadId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    state: string;
    coverageInterest: string;
    createdAt: string;
  };
}

interface WebhookResult {
  url: string;
  status: number;
  success: boolean;
}

/** Sign a payload with HMAC-SHA256 */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Get configured webhook URLs from environment */
function getWebhookUrls(): string[] {
  const urls = process.env.WEBHOOK_URLS;
  if (!urls) return [];
  return urls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Deliver a webhook to a single endpoint with retry */
async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string,
): Promise<Result<WebhookResult>> {
  const body = JSON.stringify(payload);
  const signature = secret ? signPayload(body, secret) : "";

  try {
    const response = await retry(
      async () => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": payload.event,
            "X-Webhook-Signature": signature ? `sha256=${signature}` : "",
            "X-Webhook-Timestamp": payload.timestamp,
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok && res.status >= 500) {
          throw new Error(`Server error: ${res.status}`);
        }

        return res;
      },
      3,
      1000,
    );

    return {
      ok: true,
      value: { url, status: response.status, success: response.ok },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    console.error(`[WEBHOOK FAILED] ${url}: ${message}`);
    return { ok: false, error: `${url}: ${message}` };
  }
}

/**
 * Fire webhooks for a new lead submission.
 * Non-blocking — errors are logged but don't affect the API response.
 */
export async function notifyLeadCreated(lead: {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  createdAt: string;
}): Promise<void> {
  const urls = getWebhookUrls();
  if (urls.length === 0) return;

  const secret = process.env.WEBHOOK_SECRET || "";

  const payload: WebhookPayload = {
    event: "lead.created",
    timestamp: new Date().toISOString(),
    data: {
      leadId: lead.leadId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      state: lead.state,
      coverageInterest: lead.coverageInterest,
      createdAt: lead.createdAt,
    },
  };

  // Fire all webhooks concurrently (non-blocking)
  const results = await Promise.allSettled(
    urls.map((url) => deliverWebhook(url, payload, secret)),
  );

  const successes = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok,
  ).length;
  const failures = results.length - successes;

  if (failures > 0) {
    console.warn(
      `[WEBHOOKS] ${successes}/${results.length} delivered, ${failures} failed for lead ${lead.leadId}`,
    );
  } else {
    console.log(
      `[WEBHOOKS] ${successes}/${results.length} delivered for lead ${lead.leadId}`,
    );
  }
}
