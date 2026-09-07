import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getAdminPerformanceSnapshot } from "@/app/lib/performance-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = verifyAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ success: true, analytics: await getAdminPerformanceSnapshot() });
}
