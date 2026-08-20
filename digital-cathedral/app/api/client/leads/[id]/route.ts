import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getLeadById } from "@/app/lib/database";
import { getPurchasesByLead } from "@/app/lib/client-database";
import { getLeadOperations } from "@/app/lib/lead-operations";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;
  const purchases = await getPurchasesByLead(params.id);
  const ownsLead = purchases.ok && purchases.value.some(p => p.clientId === auth.clientId && p.status === "delivered");
  if (!ownsLead) return NextResponse.json({ success: false, message: "This lead is not assigned to your account." }, { status: 403 });
  const result = await getLeadById(params.id);
  if (!result.ok) return NextResponse.json({ success: false, message: "Unable to load lead." }, { status: 500 });
  if (!result.value) return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
  const lead = result.value;
  const operations = await getLeadOperations(params.id);
  return NextResponse.json({ success: true, lead: { ...lead, ...operations, consentIp: undefined, consentUserAgent: undefined, consentText: undefined, consentSummary: lead.consentTcpa && lead.consentPrivacy ? `Consent recorded ${lead.consentTimestamp}` : "Consent requires admin review" } });
}
