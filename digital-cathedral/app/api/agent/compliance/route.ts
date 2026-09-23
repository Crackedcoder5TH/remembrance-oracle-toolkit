import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getPurchasesByClient } from "@/app/lib/client-database";
import { getLeadById } from "@/app/lib/database";
import { acknowledgeAgent, getAcknowledgement } from "@/app/lib/compliance";
export async function GET(req:NextRequest){const auth=await verifyClient(req);if(auth instanceof NextResponse)return auth;const purchases=await getPurchasesByClient(auth.clientId,100);const delivered=purchases.ok?purchases.value.purchases.filter(p=>p.status==="delivered"):[];const leads=(await Promise.all(delivered.map(p=>getLeadById(p.leadId)))).flatMap(r=>r.ok&&r.value?[{leadId:r.value.leadId,submittedAt:r.value.createdAt,sourcePage:r.value.consentPageUrl,consentTimestamp:r.value.consentTimestamp,disclosureVersion:r.value.consentText?"Stored snapshot":"Not stored"}]:[]);return NextResponse.json({success:true,acknowledgement:await getAcknowledgement(auth.clientId),leads});}
export async function POST(req:NextRequest){const auth=await verifyClient(req);if(auth instanceof NextResponse)return auth;await acknowledgeAgent(auth.clientId,req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null,req.headers.get("user-agent"));return NextResponse.json({success:true,acknowledgement:await getAcknowledgement(auth.clientId)});}
