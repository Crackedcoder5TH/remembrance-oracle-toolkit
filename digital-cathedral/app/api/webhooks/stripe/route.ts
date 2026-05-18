import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/app/lib/stripe";
import {
  updateClientBalance,
  createBilling,
  getBillingById,
  getClientById,
} from "@/app/lib/client-database";
import { createRequestLogger } from "@/app/lib/logger";
import type Stripe from "stripe";

/**
 * Stripe Webhook Handler
 *
 * POST /api/webhooks/stripe
 *
 * Listens for payment_intent.succeeded events to credit client balances.
 * Must verify the webhook signature using STRIPE_WEBHOOK_SECRET.
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

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const metadata = paymentIntent.metadata ?? {};
    const clientId = metadata.clientId;
    const type = metadata.type;

    if (type === "add_funds" && clientId) {
      // Idempotency. Stripe delivers webhooks at-least-once and retries on
      // any timeout or non-2xx, so the same payment_intent.succeeded can
      // arrive more than once. The billing row's id is derived from the
      // payment intent and client_billing.billing_id is UNIQUE — so a
      // replayed delivery can never credit the balance twice.
      const billingId = `billing_${paymentIntent.id}`;

      const alreadyProcessed = await getBillingById(billingId);
      if (alreadyProcessed.ok && alreadyProcessed.value) {
        log.info("Duplicate Stripe webhook ignored — already processed", {
          eventId: event.id,
          paymentIntentId: paymentIntent.id,
        });
        return NextResponse.json({ received: true, duplicate: true });
      }

      // Verify clientId exists and is active before crediting
      const clientResult = await getClientById(clientId);
      if (!clientResult.ok || !clientResult.value || clientResult.value.status !== "active") {
        // Not retryable — bad metadata will never resolve to a valid
        // client. Acknowledge with 200 so Stripe stops redelivering.
        log.warn("Webhook references invalid or inactive client — acknowledged without action", { clientId, paymentIntentId: paymentIntent.id });
        return NextResponse.json({ received: true, ignored: "invalid client reference" });
      }

      const amount = paymentIntent.amount;
      const now = new Date().toISOString();

      // Record the billing row FIRST. The UNIQUE billing_id is the dedup
      // gate: only the delivery whose insert wins proceeds to credit, so
      // a concurrent duplicate cannot also credit the balance.
      const billingResult = await createBilling({
        billingId,
        clientId,
        periodStart: now,
        periodEnd: now,
        leadsPurchased: 0,
        totalAmount: amount,
        paymentStatus: "paid",
        invoiceUrl: "",
        createdAt: now,
      });
      if (!billingResult.ok) {
        // Insert failed. If the row exists now, a concurrent delivery won
        // the race — acknowledge as a duplicate. Otherwise it's a real
        // failure: return 500 so Stripe retries.
        const raced = await getBillingById(billingId);
        if (raced.ok && raced.value) {
          log.info("Duplicate Stripe webhook ignored — concurrent delivery", {
            eventId: event.id,
            paymentIntentId: paymentIntent.id,
          });
          return NextResponse.json({ received: true, duplicate: true });
        }
        log.error("Failed to record billing", { clientId, billingId, detail: billingResult.error });
        return NextResponse.json(
          { error: "Billing record failed" },
          { status: 500 }
        );
      }

      // The billing insert won — this is the first delivery. Credit now.
      const balanceResult = await updateClientBalance(clientId, amount);
      if (!balanceResult.ok) {
        log.error("Failed to credit client balance", { clientId, amount });
        return NextResponse.json(
          { error: "Balance update failed" },
          { status: 500 }
        );
      }

      log.info("Client balance credited", { clientId, amount, billingId });
    }
  }

  return NextResponse.json({ received: true });
}
