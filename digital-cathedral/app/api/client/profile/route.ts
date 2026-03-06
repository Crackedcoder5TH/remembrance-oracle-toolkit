import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getClientById } from "@/app/lib/client-database";

/**
 * Client Profile API
 *
 * GET /api/client/profile — Get authenticated client's profile
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const result = await getClientById(auth.clientId);
  if (!result.ok || !result.value) {
    return NextResponse.json({ success: false, message: "Client not found." }, { status: 404 });
  }

  const { passwordHash, ...client } = result.value;

  return NextResponse.json({ success: true, client });
}
