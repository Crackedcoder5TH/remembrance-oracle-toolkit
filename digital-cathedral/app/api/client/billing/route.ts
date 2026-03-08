import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getBillingByClient } from "@/app/lib/client-database";

/**
 * Client Billing API
 *
 * GET /api/client/billing — Get billing history
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const billingResult = await getBillingByClient(auth.clientId);

  return NextResponse.json({
    success: true,
    billing: billingResult.ok ? billingResult.value : [],
  });
}
