import { NextRequest, NextResponse } from "next/server";
import { list, get } from "@vercel/blob";

const VALID_SLOTS = ["logo", "profile", "veteran-group", "founder-photo"];

/** GET /api/image?slot=profile — proxies the private blob so it renders in <img> tags */
export async function GET(request: NextRequest) {
  try {
    const slot = request.nextUrl.searchParams.get("slot");
    if (!slot || !VALID_SLOTS.includes(slot)) {
      return new NextResponse("Not found", { status: 404 });
    }

    const result = await list({ prefix: `uploads/${slot}` });
    const blobMeta = result.blobs[0];
    if (!blobMeta) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Fetch the blob contents server-side using the token (works with private stores)
    const blobData = await get(blobMeta.url, { access: "private" });
    if (!blobData || !blobData.stream) {
      return new NextResponse("Image not available", { status: 502 });
    }

    const contentType = blobData.blob?.contentType || "application/octet-stream";

    return new NextResponse(blobData.stream as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (err) {
    console.error("[IMAGE PROXY] Error:", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
