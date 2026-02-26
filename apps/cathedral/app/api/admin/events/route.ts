import { NextRequest } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { subscribe, type LeadEvent } from "@/app/lib/lead-events";

/**
 * SSE endpoint for real-time admin notifications.
 *
 * Authenticated admins connect via EventSource to receive
 * real-time lead.created events without polling.
 *
 * Usage (client):
 *   const es = new EventSource("/api/admin/events?token=<ADMIN_API_KEY>");
 *   es.addEventListener("lead.created", (e) => { ... });
 */
export async function GET(req: NextRequest) {
  // Verify admin — check token from query param (EventSource can't set headers)
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify token against ADMIN_API_KEY
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || token !== adminKey) {
    return new Response("Forbidden", { status: 403 });
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
