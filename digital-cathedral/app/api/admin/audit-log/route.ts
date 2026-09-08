import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getComplianceData } from "@/app/lib/compliance";
export async function GET(req:NextRequest){const denied=verifyAdmin(req);if(denied)return denied;return NextResponse.json({success:true,audit:(await getComplianceData()).audit});}
