import { NextRequest, NextResponse } from "next/server";
import { list, getDownloadUrl } from "@vercel/blob";

const VALID_SLOTS = ["logo", "profile", "veteran-group", "founder-photo"];

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};

/** GET /api/image?slot=profile — proxies the blob image so it renders in <img> tags */
export async function GET(request: NextRequest) {
  try {
    const slot = request.nextUrl.searchParams.get("slot");
    if (!slot || !VALID_SLOTS.includes(slot)) {
      return new NextResponse("Not found", { status: 404 });
    }

    const result = await list({ prefix: `uploads/${slot}` });
    const blob = result.blobs[0];
    if (!blob) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Get a signed URL and fetch the actual image bytes server-side
    const downloadUrl = await getDownloadUrl(blob.url);
    const imageRes = await fetch(downloadUrl);
    if (!imageRes.ok) {
      return new NextResponse("Failed to fetch image", { status: 502 });
    }

    const imageBuffer = await imageRes.arrayBuffer();

    // Determine content type from the blob pathname extension
    const ext = blob.pathname.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new NextResponse(imageBuffer, {
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
