/**
 * Money ledger emit — hand a Stripe-settled payment to the Remembrance
 * blockchain for transparent, tamper-evident, decentralized anchoring.
 *
 * Stripe is the source of truth for the money. This is the backup/proof layer,
 * and it runs strictly OFF the charge path:
 *   - fire-and-forget — callers `void` it; it never throws into checkout;
 *   - no-ops when MONEY_ANCHOR_URL is unset (anchoring simply not configured);
 *   - hard-capped timeout so a slow anchor can never hold a checkout open.
 *
 * The event is PII-free by construction — references and amounts only. The
 * chain is public and permanent, so no email / name / phone / card ever leaves
 * here. assertPiiFree is a second line of defence at the boundary.
 */

export interface MoneyEvent {
  /** Deterministic purchase id (keyed on the Stripe session). */
  purchaseId: string;
  /** Amount in the currency's minor unit (e.g. cents). */
  amount: number;
  currency: string;
  /** Stripe payment-intent id — a reference, not PII. */
  paymentRef: string;
  /** Internal opaque ids — not personal data. */
  leadRef?: string;
  clientRef?: string;
  /** ISO timestamp of the purchase. */
  at: string;
}

const PII_KEYS = new Set([
  "email", "name", "firstname", "lastname", "phone", "tel", "address",
  "street", "city", "zip", "postal", "dob", "ssn", "card", "pan", "cvc", "cvv", "ip",
]);

const EMAIL_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

/** Refuse anything that looks like personal data before it can reach the chain. */
export function assertPiiFree(event: MoneyEvent): void {
  for (const [key, value] of Object.entries(event)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      throw new Error(`money event must be PII-free; refusing key '${key}'`);
    }
    if (typeof value === "string" && EMAIL_RE.test(value)) {
      throw new Error(`money event field '${key}' looks like an email; refusing`);
    }
  }
}

/**
 * Emit a money event to the anchor service. Resolves to `{ ok }` and never
 * rejects — a slow or down anchor can never affect a sale. The purchase is
 * already settled and in Postgres, so the ecosystem can backfill the anchor
 * from purchases later if this best-effort emit misses.
 */
export async function emitMoneyEvent(
  event: MoneyEvent,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const url = process.env.MONEY_ANCHOR_URL;
  if (!url) return { ok: true, skipped: true };

  try {
    assertPiiFree(event);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.MONEY_ANCHOR_TOKEN
          ? { authorization: `Bearer ${process.env.MONEY_ANCHOR_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
