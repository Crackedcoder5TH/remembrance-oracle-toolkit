/**
 * Public Site Content API — GET only
 *
 * Returns editable site content for the homepage. No auth required.
 */

import { NextResponse } from "next/server";
import { getSiteContent } from "../../lib/site-content";

export async function GET() {
  const content = getSiteContent();
  return NextResponse.json({ content });
}
