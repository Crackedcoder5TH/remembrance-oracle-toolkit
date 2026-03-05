import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifyAdmin } from "../../lib/admin-auth";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const VALID_SLOTS = ["logo", "profile", "veteran-group"];

export async function POST(request: NextRequest) {
  try {
    // Admin authentication required
    const authError = await verifyAdmin(request);
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

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const filename = `${slot}.${ext}`;

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const filePath = path.join(uploadsDir, filename);
    await writeFile(filePath, bytes);

    const url = `/uploads/${filename}`;
    return NextResponse.json({ url, filename, slot });
  } catch (err) {
    console.error("[UPLOAD] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
