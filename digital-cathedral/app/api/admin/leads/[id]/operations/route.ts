import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { AGENT_STATUSES, getLeadOperations, updateLeadOperations } from "@/app/lib/lead-operations";
export async function GET(req:NextRequest,{params}:{params:{id:string}}){const denied=verifyAdmin(req);if(denied)return denied;return NextResponse.json({success:true,operations:await getLeadOperations(params.id,true)});}
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){const denied=verifyAdmin(req);if(denied)return denied;const body=await req.json();if(body.status&&!AGENT_STATUSES.includes(body.status))return NextResponse.json({success:false,message:"Invalid status."},{status:400});if(body.note&&(!String(body.note).trim()||String(body.note).length>4000))return NextResponse.json({success:false,message:"Invalid note."},{status:400});return NextResponse.json({success:true,operations:await updateLeadOperations(params.id,"admin","admin",body)});}
