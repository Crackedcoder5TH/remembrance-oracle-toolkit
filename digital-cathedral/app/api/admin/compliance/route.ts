import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getFilteredLeads } from "@/app/lib/database";
import { getFilteredClients } from "@/app/lib/client-database";
import { getLeadOperationsSummary, updateLeadOperations } from "@/app/lib/lead-operations";
import { addSuppression, createPrivacyRequest, getComplianceData, markComplianceReviewed, PRIVACY_REQUEST_STATUSES, PRIVACY_REQUEST_TYPES, updatePrivacyRequest } from "@/app/lib/compliance";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const denied = verifyAdmin(req); if (denied) return denied;
  const [leadResult, clientResult, compliance] = await Promise.all([getFilteredLeads({ limit: 200 }),getFilteredClients({ limit: 200 }),getComplianceData()]);
  // The dashboard reads only status / doNotContact / disputeStatus per lead, so
  // use the summary reader (one query) rather than getLeadOperations (ops + notes
  // + activity = 3 queries each) — over 200 leads that was ~600 queries + note
  // over-fetch on every load.
  const leads = leadResult.ok ? await Promise.all(leadResult.value.leads.map(async lead => ({ ...lead, operations: await getLeadOperationsSummary(lead.leadId) }))) : [];
  const agents = clientResult.ok ? clientResult.value.clients.map(({passwordHash: _passwordHash,...client}) => client) : [];
  return NextResponse.json({ success:true, leads, agents, ...compliance });
}

export async function POST(req: NextRequest) {
  const denied = verifyAdmin(req); if (denied) return denied;
  let body;try{body=await req.json();}catch{return NextResponse.json({success:false,message:"Invalid JSON body."},{status:400});}
  if (body.action === "suppress" && ["phone","email"].includes(body.kind) && body.value) await addSuppression(body.kind,String(body.value),String(body.reason || "Consumer opt-out"),String(body.source || "admin"),"admin");
  else if (body.action === "privacy" && PRIVACY_REQUEST_TYPES.includes(body.requestType) && body.requester) await createPrivacyRequest(body,"admin");
  else if (body.action === "privacy-update" && Number.isInteger(body.id) && PRIVACY_REQUEST_STATUSES.includes(body.status)) await updatePrivacyRequest(body.id,body.status,String(body.notes || ""),body.assignedAdmin ? String(body.assignedAdmin) : null,"admin");
  else if (body.action === "review" && body.leadId) await markComplianceReviewed(String(body.leadId),"admin");
  else if (body.action === "dnc" && body.leadId) await updateLeadOperations(String(body.leadId),"admin","admin",{status:"Do Not Contact",note:String(body.note || "Do Not Contact recorded by compliance review"),visibility:"internal"});
  else return NextResponse.json({success:false,message:"Invalid compliance action."},{status:400});
  return NextResponse.json({success:true});
}
