import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getLeadById } from "@/app/lib/database";
import { getPurchasesByLead } from "@/app/lib/client-database";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = verifyAdmin(req); if (denied) return denied;
  const [leadResult, purchaseResult] = await Promise.all([getLeadById(params.id), getPurchasesByLead(params.id)]);
  if (!leadResult.ok) return NextResponse.json({ success: false, message: "Unable to load lead." }, { status: 500 });
  if (!leadResult.value) return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
  return NextResponse.json({ success: true, lead: leadResult.value, purchases: purchaseResult.ok ? purchaseResult.value : [] });
}
