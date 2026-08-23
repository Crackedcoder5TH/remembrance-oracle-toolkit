import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getPurchasesByLead } from "@/app/lib/client-database";
import { AGENT_EVENT_TYPES, AGENT_STATUSES, getLeadOperations, updateLeadOperations } from "@/app/lib/lead-operations";

async function authorize(req: NextRequest, leadId: string) {
  const auth = await verifyClient(req); if (auth instanceof NextResponse) return auth;
  const purchases = await getPurchasesByLead(leadId);
  if (!purchases.ok || !purchases.value.some(p => p.clientId === auth.clientId && p.status === "delivered")) return NextResponse.json({ success:false, message:"This lead is not assigned to your account." },{status:403});
  return auth;
}
export async function GET(req: NextRequest,{params}:{params:{id:string}}){const auth=await authorize(req,params.id);if(auth instanceof NextResponse)return auth;return NextResponse.json({success:true,operations:await getLeadOperations(params.id)});}
export async function PATCH(req: NextRequest,{params}:{params:{id:string}}){const auth=await authorize(req,params.id);if(auth instanceof NextResponse)return auth;let body;try{body=await req.json();}catch{return NextResponse.json({success:false,message:"Invalid JSON body."},{status:400});}if(body.status&&!AGENT_STATUSES.includes(body.status))return NextResponse.json({success:false,message:"Invalid status."},{status:400});if(body.eventType!==undefined&&!(AGENT_EVENT_TYPES as readonly string[]).includes(body.eventType))return NextResponse.json({success:false,message:"Invalid eventType."},{status:400});for(const key of ["nextFollowUpAt","appointmentAt"]){if(body[key]&&Number.isNaN(Date.parse(body[key])))return NextResponse.json({success:false,message:`Invalid ${key}.`},{status:400});}if(body.note&&(!String(body.note).trim()||String(body.note).length>4000))return NextResponse.json({success:false,message:"Note must be between 1 and 4,000 characters."},{status:400});const operations=await updateLeadOperations(params.id,auth.clientId,"agent",body);return NextResponse.json({success:true,operations});}
