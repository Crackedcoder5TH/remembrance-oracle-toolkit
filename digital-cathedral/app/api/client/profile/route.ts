import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getClientById, getClientByEmail } from "@/app/lib/client-database";

/** Admin owner identity — used when the admin master-key login has no DB row. */
const ADMIN_CLIENT_ID = "client_admin_owner";
const ADMIN_CLIENT_EMAIL = (process.env.CLIENT_ADMIN_EMAIL ?? "admin@valorlegacies.xyz").trim().toLowerCase();

/**
 * Client Profile API
 *
 * GET /api/client/profile — Get authenticated client's profile
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  // Try loading from DB by clientId first
  const result = await getClientById(auth.clientId);
  if (result.ok && result.value) {
    const { passwordHash, ...client } = result.value;
    return NextResponse.json({ success: true, client });
  }

  // Admin owner fallback — if the admin master-key login was used but no DB row
  // exists, try by email or return a synthetic profile so the dashboard loads.
  if (auth.clientId === ADMIN_CLIENT_ID) {
    const byEmail = await getClientByEmail(ADMIN_CLIENT_EMAIL);
    if (byEmail.ok && byEmail.value) {
      const { passwordHash, ...client } = byEmail.value;
      return NextResponse.json({ success: true, client });
    }

    // Fully synthetic — no database at all
    return NextResponse.json({
      success: true,
      client: {
        clientId: ADMIN_CLIENT_ID,
        companyName: "Valor Legacies (Owner)",
        contactName: "Admin Owner",
        email: ADMIN_CLIENT_EMAIL,
        phone: "",
        status: "active",
        pricingTier: "enterprise",
        pricePerLead: 0,
        exclusivePrice: 0,
        stateLicenses: "[]",
        coverageTypes: "[]",
        dailyCap: 9999,
        monthlyCap: 99999,
        minScore: 0,
        balance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ success: false, message: "Client not found." }, { status: 404 });
}
