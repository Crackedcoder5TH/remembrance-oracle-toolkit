import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getLeadById } from "@/app/lib/database";
import { getPurchasesByLead } from "@/app/lib/client-database";
import { getLeadOperations } from "@/app/lib/lead-operations";
import { getComplianceData, isSuppressed, recordAudit } from "@/app/lib/compliance";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = verifyAdmin(req); if (denied) return denied;
  const [leadResult, purchaseResult] = await Promise.all([getLeadById(params.id), getPurchasesByLead(params.id)]);
  if (!leadResult.ok) return NextResponse.json({ success: false, message: "Unable to load lead." }, { status: 500 });
  if (!leadResult.value) return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
  const [operations,compliance,suppressed]=await Promise.all([getLeadOperations(params.id,true),getComplianceData(),isSuppressed(leadResult.value.phone,leadResult.value.email)]);
  await recordAudit({actorId:"admin",actorRole:"admin",eventType:"lead_viewed",targetType:"lead",targetId:params.id,summary:"Admin viewed lead compliance detail",ip:req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null,userAgent:req.headers.get("user-agent")});
  return NextResponse.json({ success: true, lead: leadResult.value, purchases: purchaseResult.ok ? purchaseResult.value : [], operations, compliance:{suppressed,privacyRequests:compliance.privacyRequests.filter(r=>r.leadId===params.id),reviewed:compliance.reviewedLeadIds.includes(params.id)} });
}
