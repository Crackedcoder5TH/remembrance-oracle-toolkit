import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import {
  updateClientBalance,
  createBilling,
  generateBillingId,
} from "@/app/lib/client-database";

/**
 * Client Add Funds API
 *
 * POST /api/client/add-funds — Process payment and add funds to balance
 *
 * In production, this would integrate with Stripe or another payment processor.
 * Currently processes payments directly (simulated) and credits the balance.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { amount, cardLast4, cardBrand, cardExpiry, saveCard } = body;

    // Validate amount
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

    if (!cardLast4 || !cardBrand) {
      return NextResponse.json(
        { success: false, message: "Card information is required." },
        { status: 400 }
      );
    }

    // In production: integrate with Stripe here
    // const paymentIntent = await stripe.paymentIntents.create({ amount, currency: 'usd', ... });
    // For now, simulate successful payment processing

    // Credit the balance
    const balanceResult = await updateClientBalance(auth.clientId, amount);
    if (!balanceResult.ok) {
      return NextResponse.json(
        { success: false, message: "Failed to update balance." },
        { status: 500 }
      );
    }

    // Create a billing record for this deposit
    const now = new Date().toISOString();
    await createBilling({
      billingId: generateBillingId(),
      clientId: auth.clientId,
      periodStart: now,
      periodEnd: now,
      leadsPurchased: 0,
      totalAmount: amount,
      paymentStatus: "paid",
      invoiceUrl: "",
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      message: `$${(amount / 100).toFixed(2)} added to your balance.`,
      newBalance: balanceResult.value.newBalance,
      transaction: {
        amount,
        cardLast4,
        cardBrand,
        cardExpiry,
        savedCard: saveCard || false,
        processedAt: now,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Payment processing failed." },
      { status: 500 }
    );
  }
}
