import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/app/lib/stripe";
import {
  updateClientBalance,
  createBilling,
  generateBillingId,
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
      // Verify clientId exists and is active before crediting
      const clientResult = await getClientById(clientId);
      if (!clientResult.ok || !clientResult.value || clientResult.value.status !== "active") {
        log.error("Webhook references invalid or inactive client", { clientId, paymentIntentId: paymentIntent.id });
        return NextResponse.json(
          { error: "Invalid client reference in payment metadata" },
          { status: 400 }
        );
      }

      const amount = paymentIntent.amount;

      // Credit the client's balance
      const balanceResult = await updateClientBalance(clientId, amount);
      if (!balanceResult.ok) {
        log.error("Failed to credit client balance", { clientId, amount });
        return NextResponse.json(
          { error: "Balance update failed" },
          { status: 500 }
        );
      }

      // Create a billing record
      const now = new Date().toISOString();
      await createBilling({
        billingId: generateBillingId(),
        clientId,
        periodStart: now,
        periodEnd: now,
        leadsPurchased: 0,
        totalAmount: amount,
        paymentStatus: "paid",
        invoiceUrl: "",
        createdAt: now,
      });

      log.info("Client balance credited", { clientId, amount });
    }
  }

  return NextResponse.json({ received: true });
}
