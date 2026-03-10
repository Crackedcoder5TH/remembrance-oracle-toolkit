import { NextRequest, NextResponse } from "next/server";
import {
  getClientByEmail,
  createClient,
  generateClientId,
  hashPassword,
  type ClientRecord,
} from "@/app/lib/client-database";
import {
  createClientSessionToken,
  CLIENT_SESSION_COOKIE,
  CLIENT_SESSION_MAX_AGE,
} from "@/app/lib/client-auth";

/**
 * Client Registration API
 *
 * POST /api/client/register — Create a new client account and set session cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, companyName, contactName, phone } = body;

    // Validation
    if (!email || !password || !contactName) {
      return NextResponse.json(
        { success: false, message: "Email, password, and contact name are required." },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    // Check if account already exists
    const existing = await getClientByEmail(email.trim().toLowerCase());
    if (!existing.ok) {
      return NextResponse.json({ success: false, message: "Service unavailable." }, { status: 503 });
    }
    if (existing.value) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists. Please sign in." },
        { status: 409 },
      );
    }

    // Create client with default pricing
    const clientId = generateClientId();
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    const client: ClientRecord = {
      clientId,
      companyName: (companyName || contactName).trim(),
      contactName: contactName.trim(),
      email: email.trim().toLowerCase(),
      phone: (phone || "").trim(),
      passwordHash,
      status: "active",
      pricingTier: "standard",
      pricePerLead: 6000,
      exclusivePrice: 12000,
      stateLicenses: "[]",
      coverageTypes: "[]",
      dailyCap: 50,
      monthlyCap: 500,
      minScore: 0,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await createClient(client);
    if (!result.ok) {
      const msg = result.error;
      if (typeof msg === "string" && (msg.includes("UNIQUE") || msg.includes("duplicate"))) {
        return NextResponse.json(
          { success: false, message: "An account with this email already exists." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, message: typeof msg === "string" ? msg : "Registration failed." },
        { status: 500 },
      );
    }

    // Create session and set cookie
    const token = createClientSessionToken(clientId, email.trim().toLowerCase());

    const response = NextResponse.json({
      success: true,
      clientId,
      companyName: client.companyName,
    });

    response.cookies.set(CLIENT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CLIENT_SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request." },
      { status: 400 },
    );
  }
}
