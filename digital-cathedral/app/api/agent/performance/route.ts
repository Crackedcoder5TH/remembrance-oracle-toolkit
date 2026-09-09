import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getClientById } from "@/app/lib/client-database";
import { getAgentPerformanceSnapshot } from "@/app/lib/performance-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;
  const [analytics, client] = await Promise.all([
    getAgentPerformanceSnapshot(auth.clientId),
    getClientById(auth.clientId),
  ]);
  return NextResponse.json({
    success: true,
    analytics,
    creditsAvailable: client.ok && client.value ? client.value.balance : 0,
  });
}
