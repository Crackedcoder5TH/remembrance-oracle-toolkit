import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../lib/admin-auth";

/** Lightweight admin status check — returns { admin: true/false }. */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req);
  return NextResponse.json({ admin: authError === null });
}
