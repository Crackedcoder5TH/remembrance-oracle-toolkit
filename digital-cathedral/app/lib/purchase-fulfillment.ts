/**
 * Checkout fulfillment — turn a paid Stripe Checkout Session into a lead
 * purchase, exactly once, without overselling the lead.
 *
 * Idempotency: the purchase id is derived from the session id, so the Stripe
 * webhook and the success-page callback can both call this — whichever runs
 * first fulfils, the other is a no-op.
 *
 * Oversell guard: the capacity check (exclusivity + buyer cap) and the insert
 * run atomically inside the adapter, so two checkouts completing concurrently
 * for the same lead cannot both be recorded. The buyer that loses the race
 * has already paid, so they are refunded here.
 */

import type Stripe from "stripe";
import { createPurchaseGuarded } from "@/app/lib/client-database";
import type { LeadPurchase } from "@/app/lib/client-database";
import { stripe } from "@/app/lib/stripe";
import { emitMoneyEvent } from "@/app/lib/money-ledger";

// Leads can be returned within 72h of purchase.
const RETURN_WINDOW_MS = 72 * 60 * 60 * 1000;

export type FulfillResult =
  | { ok: true; purchase: LeadPurchase; alreadyFulfilled: boolean }
  | {
      ok: false;
      retryable: boolean;
      reason: "unpaid" | "sold_out" | "invalid" | "error";
      error: string;
    };

export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  if (session.payment_status !== "paid") {
    return { ok: false, retryable: false, reason: "unpaid", error: "Payment not completed." };
  }

  const { clientId, leadId, exclusive, price, maxBuyers } = session.metadata ?? {};
  if (!clientId || !leadId || !price) {
    return { ok: false, retryable: false, reason: "invalid", error: "Invalid session metadata." };
  }

  // Pre-fix sessions (in flight during a deploy) carry no maxBuyers — fall
  // back to an unbounded shared cap. Exclusivity is still enforced from the
  // `exclusive` flag, which every session has always carried.
  const parsedCap = parseInt(maxBuyers ?? "", 10);
  const cap = Number.isInteger(parsedCap) && parsedCap > 0 ? parsedCap : Number.MAX_SAFE_INTEGER;

  const purchase: LeadPurchase = {
    // Deterministic id keyed on the session — the dedup key for fulfillment.
    purchaseId: `purchase_${session.id}`,
    leadId,
    clientId,
    pricePaid: parseInt(price, 10),
    purchasedAt: new Date().toISOString(),
    status: "delivered",
    exclusive: exclusive === "true",
    returnReason: "",
    returnDeadline: new Date(Date.now() + RETURN_WINDOW_MS).toISOString(),
  };

  // Capacity check + insert are atomic inside the adapter — a concurrent
  // checkout for the same lead cannot also pass the cap.
  const guarded = await createPurchaseGuarded(purchase, cap);
  if (!guarded.ok) {
    return { ok: false, retryable: true, reason: "error", error: guarded.error };
  }

  if (guarded.value.outcome === "sold_out") {
    return refundOversoldSession(session);
  }

  // Transparent decentralized backup (off the charge path): hand the settled
  // payment to the Remembrance ledger / Solana anchor. PII-free, fire-and-forget
  // — `void` so it never blocks or fails fulfillment. Only a genuinely new
  // purchase emits; a redelivered webhook (duplicate) does not re-anchor.
  if (guarded.value.outcome !== "duplicate") {
    const paymentRef =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? "";
    void emitMoneyEvent({
      purchaseId: guarded.value.purchase.purchaseId,
      amount: guarded.value.purchase.pricePaid,
      currency: session.currency ?? "usd",
      paymentRef,
      leadRef: guarded.value.purchase.leadId,
      clientRef: guarded.value.purchase.clientId,
      at: guarded.value.purchase.purchasedAt,
    });
  }

  return {
    ok: true,
    purchase: guarded.value.purchase,
    alreadyFulfilled: guarded.value.outcome === "duplicate",
  };
}

/**
 * The lead filled up between checkout and fulfillment. The buyer already
 * paid, so refund them. The idempotency key is derived from the session, so
 * a redelivered webhook (or the success-page callback) refunds exactly once.
 */
async function refundOversoldSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    return { ok: false, retryable: false, reason: "sold_out", error: "Lead sold out; no payment to refund." };
  }

  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `refund_${session.id}` },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    // Refund failed — stay retryable so the webhook redelivers and tries
    // again; the idempotency key keeps a later attempt from double-refunding.
    return { ok: false, retryable: true, reason: "error", error: `Lead sold out; refund failed: ${detail}` };
  }

  return {
    ok: false,
    retryable: false,
    reason: "sold_out",
    error: "This lead sold out before your payment completed — you have been refunded.",
  };
}
