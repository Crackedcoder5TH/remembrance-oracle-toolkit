import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getBillingByClient, getClientById } from "@/app/lib/client-database";

/**
 * Client Billing API
 *
 * GET /api/client/billing — Get billing history and current balance
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const [billingResult, clientResult] = await Promise.all([
    getBillingByClient(auth.clientId),
    getClientById(auth.clientId),
  ]);

  return NextResponse.json({
    success: true,
    billing: billingResult.ok ? billingResult.value : [],
    balance: clientResult.ok && clientResult.value ? clientResult.value.balance : 0,
  });
}
