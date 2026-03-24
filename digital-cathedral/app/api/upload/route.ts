import { NextRequest, NextResponse } from "next/server";
import { put, del, list } from "@vercel/blob";
import { verifyAdmin } from "../../lib/admin-auth";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const VALID_SLOTS = ["logo", "profile", "veteran-group", "founder-photo"];

export async function POST(request: NextRequest) {
  try {
    // Check for Blob token before anything else
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[UPLOAD] BLOB_READ_WRITE_TOKEN is not set");
      return NextResponse.json(
        { error: "Image storage is not configured. Add BLOB_READ_WRITE_TOKEN to your Vercel environment variables." },
        { status: 503 },
      );
    }

    // Admin authentication required
    const authError = verifyAdmin(request);
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slot = formData.get("slot") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!slot || !VALID_SLOTS.includes(slot)) {
      return NextResponse.json({ error: "Invalid slot. Use: " + VALID_SLOTS.join(", ") }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed. Use JPEG, PNG, WebP, SVG, or GIF." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5 MB." }, { status: 400 });
    }

    // Delete any existing blob for this slot (so we replace, not accumulate)
    try {
      const existing = await list({ prefix: `uploads/${slot}` });
      for (const blob of existing.blobs) {
        await del(blob.url);
      }
    } catch {
      // First upload for this slot — nothing to delete
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const pathname = `uploads/${slot}.${ext}`;

    await put(pathname, file, {
      access: "private",
      addRandomSuffix: false,
    });

    // Return the proxy URL — /api/image fetches the blob server-side and streams it
    const proxyUrl = `/api/image?slot=${encodeURIComponent(slot)}`;
    return NextResponse.json({ url: proxyUrl, slot });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[UPLOAD] Error:", message, err);
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}

/** GET /api/upload?slot=veteran-group — returns whether an image exists for the slot */
export async function GET(request: NextRequest) {
  try {
    const slot = request.nextUrl.searchParams.get("slot");
    if (!slot || !VALID_SLOTS.includes(slot)) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }

    const result = await list({ prefix: `uploads/${slot}` });
    const blob = result.blobs[0];
    if (!blob) {
      return NextResponse.json({ url: null, slot });
    }

    // Return the proxy URL instead of a signed blob URL
    const proxyUrl = `/api/image?slot=${encodeURIComponent(slot)}`;
    return NextResponse.json({ url: proxyUrl, slot });
  } catch (err) {
    console.error("[UPLOAD GET] Error:", err);
    return NextResponse.json({ url: null });
  }
}
