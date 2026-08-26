import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({
    internalAppointments: true,
    calendarExport: true,
    externalCalendar: false,
    emailSending: false,
    smsAutomation: false,
    billingPortal: Boolean(process.env.STRIPE_CUSTOMER_PORTAL_URL),
    billingPortalUrl: process.env.STRIPE_CUSTOMER_PORTAL_URL || null,
  });
}
