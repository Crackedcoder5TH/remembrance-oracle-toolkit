import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/app/lib/stripe";
import { createRequestLogger } from "@/app/lib/logger";
import { fulfillCheckoutSession } from "@/app/lib/purchase-fulfillment";
import type Stripe from "stripe";

/**
 * Stripe Webhook Handler
 *
 * POST /api/webhooks/stripe
 *
 * Fulfils lead purchases on checkout.session.completed (and the delayed-
 * payment async_payment_succeeded). Verifies the signature with
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const log = createRequestLogger();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("Webhook signature verification failed", { detail: message });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  log.info("Stripe webhook received", { eventType: event.type, eventId: event.id });

  // Lead purchases via Stripe Checkout. Fulfillment happens here — server-side
  // and idempotent — so a purchase is recorded even if the buyer never loads
  // the success page. async_payment_succeeded covers delayed methods (ACH).
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await fulfillCheckoutSession(session);
    if (!result.ok) {
      if (result.retryable) {
        log.error("Checkout fulfillment failed — Stripe will retry", { sessionId: session.id, detail: result.error });
        return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
      }
      // Not retryable (not yet paid, or bad metadata) — acknowledge.
      log.warn("Checkout session not fulfilled", { sessionId: session.id, detail: result.error });
      return NextResponse.json({ received: true, fulfilled: false });
    }
    log.info("Checkout session fulfilled", {
      sessionId: session.id,
      purchaseId: result.purchase.purchaseId,
      duplicate: result.alreadyFulfilled,
    });
    return NextResponse.json({ received: true, fulfilled: true });
  }

  return NextResponse.json({ received: true });
}
