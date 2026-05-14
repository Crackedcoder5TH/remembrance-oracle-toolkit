import { NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return res;
}
