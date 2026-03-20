/**
 * Admin Site Content API — GET / PUT
 *
 * Allows admins to read and update editable site content (e.g., the veteran story
 * displayed on the homepage). Content is stored in the database.
 *
 * Protected by admin auth (same as all /api/admin/* routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../lib/admin-auth";
import { getSiteContent, setSiteContent } from "../../../lib/site-content";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const content = await getSiteContent();
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    if (!body.veteranStory || typeof body.veteranStory !== "string") {
      return NextResponse.json(
        { error: "veteranStory is required and must be a string" },
        { status: 400 },
      );
    }

    // Limit length to prevent abuse
    if (body.veteranStory.length > 5000) {
      return NextResponse.json(
        { error: "veteranStory must be under 5000 characters" },
        { status: 400 },
      );
    }

    await setSiteContent({ veteranStory: body.veteranStory });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
