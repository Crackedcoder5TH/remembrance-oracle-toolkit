import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { stripe } from "@/app/lib/stripe";

/**
 * Create a Stripe PaymentIntent for adding funds to client balance.
 *
 * POST /api/client/create-payment-intent
 * Body: { amount: number } — amount in cents (min 500, max 1000000)
 *
 * Returns: { clientSecret: string } — used by Stripe Elements on the frontend.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { amount } = body;

    if (!amount || typeof amount !== "number" || amount < 500) {
      return NextResponse.json(
        { success: false, message: "Minimum fund amount is $5.00." },
        { status: 400 }
      );
    }

    if (amount > 1000000) {
      return NextResponse.json(
        { success: false, message: "Maximum fund amount is $10,000.00." },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: {
        clientId: auth.clientId,
        type: "add_funds",
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to initialize payment." },
      { status: 500 }
    );
  }
}
