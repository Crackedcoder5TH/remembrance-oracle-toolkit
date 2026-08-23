import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getPurchasesByLead } from "@/app/lib/client-database";
import { AGENT_EVENT_TYPES, AGENT_STATUSES, getLeadOperations, updateLeadOperations } from "@/app/lib/lead-operations";
import { addSuppression, recordAudit } from "@/app/lib/compliance";
import { getLeadById } from "@/app/lib/database";

async function authorize(req: NextRequest, leadId: string) {
  const auth = await verifyClient(req); if (auth instanceof NextResponse) return auth;
  const purchases = await getPurchasesByLead(leadId);
  if (!purchases.ok || !purchases.value.some(p => p.clientId === auth.clientId && p.status === "delivered")) return NextResponse.json({ success:false, message:"This lead is not assigned to your account." },{status:403});
  return auth;
}
export async function GET(req: NextRequest,{params}:{params:{id:string}}){const auth=await authorize(req,params.id);if(auth instanceof NextResponse)return auth;return NextResponse.json({success:true,operations:await getLeadOperations(params.id)});}
export async function PATCH(req: NextRequest,{params}:{params:{id:string}}){
  const auth=await authorize(req,params.id);if(auth instanceof NextResponse)return auth;
  let body;try{body=await req.json();}catch{return NextResponse.json({success:false,message:"Invalid JSON body."},{status:400});}
  if(body.status&&!AGENT_STATUSES.includes(body.status))return NextResponse.json({success:false,message:"Invalid status."},{status:400});
  if(body.eventType!==undefined&&!(AGENT_EVENT_TYPES as readonly string[]).includes(body.eventType))return NextResponse.json({success:false,message:"Invalid eventType."},{status:400});
  for(const key of ["nextFollowUpAt","appointmentAt"]){if(body[key]&&Number.isNaN(Date.parse(body[key])))return NextResponse.json({success:false,message:`Invalid ${key}.`},{status:400});}
  if(body.note&&(!String(body.note).trim()||String(body.note).length>4000))return NextResponse.json({success:false,message:"Note must be between 1 and 4,000 characters."},{status:400});
  const operations=await updateLeadOperations(params.id,auth.clientId,"agent",body);
  // An authorized agent reporting Do Not Contact records a global opt-out for the
  // lead's contact points so no future purchase or contact reaches them.
  if(body.status==="Do Not Contact"){const lead=await getLeadById(params.id);if(lead.ok&&lead.value){await Promise.all([addSuppression("phone",lead.value.phone,"Consumer Do Not Contact request","authorized agent report",auth.clientId),addSuppression("email",lead.value.email,"Consumer Do Not Contact request","authorized agent report",auth.clientId)]);}}
  // eventType is allow-listed above, so it is safe to record on the audit trail.
  await recordAudit({actorId:auth.clientId,actorRole:"agent",eventType:body.status==="Do Not Contact"?"do_not_contact_marked":body.eventType||"lead_operations_updated",targetType:"lead",targetId:params.id,summary:body.status==="Do Not Contact"?"Do Not Contact reported":"Authorized lead operations updated",ip:req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null,userAgent:req.headers.get("user-agent")});
  return NextResponse.json({success:true,operations});
}
