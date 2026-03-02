import { NextRequest } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { subscribe, type LeadEvent } from "@/app/lib/lead-events";

/**
 * SSE endpoint for real-time admin notifications.
 *
 * Authentication: session cookie (sent automatically by EventSource)
 * or query param token (fallback for programmatic access).
 *
 * Usage (client):
 *   const es = new EventSource("/api/admin/events");
 */
export async function GET(req: NextRequest) {
  // Method 1: Session cookie (EventSource sends cookies automatically)
  const authError = verifyAdmin(req);

  // Method 2: Query param fallback (for programmatic access)
  if (authError) {
    const token = req.nextUrl.searchParams.get("token");
    const adminKey = process.env.ADMIN_API_KEY;
    if (!token || !adminKey || token !== adminKey) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ message: "Connected to lead events" })}\n\n`)
      );

      // Keep-alive heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Subscribe to lead events
      const unsubscribe = subscribe((event: LeadEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          );
        } catch {
          // Connection closed
          unsubscribe();
          clearInterval(heartbeat);
        }
      });

      // Clean up when the request is aborted
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
