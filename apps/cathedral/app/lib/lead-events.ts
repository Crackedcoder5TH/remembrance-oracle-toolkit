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
