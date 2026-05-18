/**
 * Checkout fulfillment — turn a paid Stripe Checkout Session into a lead
 * purchase, exactly once.
 *
 * The purchase id is derived from the session id and lead_purchases.purchase_id
 * is UNIQUE, so the Stripe webhook and the success-page callback can both call
 * this: whichever runs first fulfils, the other is an idempotent no-op.
 */

import type Stripe from "stripe";
import { createPurchase, getPurchasesByLead } from "@/app/lib/client-database";
import type { LeadPurchase } from "@/app/lib/client-database";

// Leads can be returned within 72h of purchase.
const RETURN_WINDOW_MS = 72 * 60 * 60 * 1000;

export type FulfillResult =
  | { ok: true; purchase: LeadPurchase; alreadyFulfilled: boolean }
  | { ok: false; retryable: boolean; error: string };

export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  if (session.payment_status !== "paid") {
    return { ok: false, retryable: false, error: "Payment not completed." };
  }

  const { clientId, leadId, exclusive, price } = session.metadata ?? {};
  if (!clientId || !leadId || !price) {
    return { ok: false, retryable: false, error: "Invalid session metadata." };
  }

  // Deterministic id keyed on the session — the dedup key for fulfillment.
  const purchaseId = `purchase_${session.id}`;

  // Purchases per lead are bounded by the tier buyer cap, so scanning the
  // lead's purchases for this session's id is cheap.
  const existing = await getPurchasesByLead(leadId);
  if (existing.ok) {
    const already = existing.value.find((p) => p.purchaseId === purchaseId);
    if (already) return { ok: true, purchase: already, alreadyFulfilled: true };
  }

  const purchase: LeadPurchase = {
    purchaseId,
    leadId,
    clientId,
    pricePaid: parseInt(price, 10),
    purchasedAt: new Date().toISOString(),
    status: "delivered",
    exclusive: exclusive === "true",
    returnReason: "",
    returnDeadline: new Date(Date.now() + RETURN_WINDOW_MS).toISOString(),
  };

  // Insert is the dedup gate: lead_purchases.purchase_id is UNIQUE, so only
  // the first caller's insert wins. A concurrent caller loses the race.
  const created = await createPurchase(purchase);
  if (!created.ok) {
    const recheck = await getPurchasesByLead(leadId);
    if (recheck.ok) {
      const raced = recheck.value.find((p) => p.purchaseId === purchaseId);
      if (raced) return { ok: true, purchase: raced, alreadyFulfilled: true };
    }
    return { ok: false, retryable: true, error: created.error };
  }

  return { ok: true, purchase, alreadyFulfilled: false };
}
