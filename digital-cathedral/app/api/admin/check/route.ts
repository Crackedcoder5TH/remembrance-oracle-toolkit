import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../lib/admin-auth";

/** Lightweight admin status check — returns 401 if not admin, { admin: true } if admin. */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;
  return NextResponse.json({ admin: true });
}
