import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/app/lib/admin-session";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
