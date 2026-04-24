/**
 * Lead Event Bus — Real-time notification system
 *
 * Uses Server-Sent Events (SSE) for real-time admin notifications.
 * When a new lead is created, all connected admin dashboards receive
 * the update instantly without polling.
 *
 * Architecture:
 *  - In-memory subscriber set (suitable for single-process deployment)
 *  - Each SSE connection registers a callback
 *  - On lead.created, all subscribers receive the event
 *
 * ⚠ SERVERLESS LIMITATION ⚠
 * The `subscribers` Set is module-scoped per Lambda. On Vercel:
 *   - An admin's SSE connection lives on one Lambda instance
 *   - A new lead arrives on a (probably different) Lambda instance
 *   - broadcast() fires only on the Lambda where the lead was created,
 *     so the admin's open stream may receive nothing
 *
 * The fallback path works fine: every admin page fetches data on mount
 * and the SSE stream is purely a real-time-flair on top. This isn't a
 * correctness bug — it's a "real-time notifications won't reliably
 * cross Lambda boundaries" UX limitation.
 *
 * For true cross-Lambda real-time:
 *   1. Vercel KV / Upstash Redis pub/sub
 *   2. Postgres LISTEN/NOTIFY (works, but holds a connection)
 *   3. Pusher / Ably / Liveblocks — managed real-time service
 */

type LeadEventCallback = (event: LeadEvent) => void;

export interface LeadEvent {
  type: "lead.created";
  data: {
    leadId: string;
    firstName: string;
    lastName: string;
    state: string;
    coverageInterest: string;
    veteranStatus: string;
    score?: number;
    tier?: string;
    createdAt: string;
  };
}

const subscribers = new Set<LeadEventCallback>();

/** Subscribe to lead events. Returns an unsubscribe function. */
export function subscribe(callback: LeadEventCallback): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Broadcast a lead event to all connected subscribers */
export function broadcast(event: LeadEvent): void {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch {
      // Subscriber error — don't block other subscribers
    }
  }
}

/** Get count of currently connected subscribers */
export function getSubscriberCount(): number {
  return subscribers.size;
}
