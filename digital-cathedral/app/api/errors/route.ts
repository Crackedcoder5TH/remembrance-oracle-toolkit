/**
 * Server endpoint for client-side error reports.
 *
 * Receives error reports from the ErrorReporter client component,
 * logs them with the structured logger, and returns 204.
 * Rate-limited per IP to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { herald } from "@/app/lib/logger";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rateCheck = checkRateLimit(clientIp, 10, 60_000); // 10 error reports per minute per IP

  if (!rateCheck.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    const body = await req.json();

    const { type, message, stack, source, line, col, url, userAgent, timestamp } = body;

    herald.warn("Client error reported", {
      errorType: type || "unknown",
      message: typeof message === "string" ? message.slice(0, 1000) : "unknown",
      stack: typeof stack === "string" ? stack.slice(0, 2000) : undefined,
      source: typeof source === "string" ? source.slice(0, 500) : undefined,
      line: typeof line === "number" ? line : undefined,
      col: typeof col === "number" ? col : undefined,
      pageUrl: typeof url === "string" ? url.slice(0, 500) : undefined,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 500) : undefined,
      reportedAt: timestamp,
      clientIp,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
