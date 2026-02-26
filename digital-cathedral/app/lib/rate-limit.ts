/**
 * IP-Based Rate Limiter
 *
 * Uses an in-memory sliding window approach. Each IP gets a window of
 * timestamps. Requests beyond the limit within the window are rejected.
 * Stale entries are cleaned up automatically to prevent memory leaks.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// --- Sliding window with per-IP tracking for API protection ---

/**
 * Check if an IP is rate-limited.
 * @returns { allowed: true } or { allowed: false, retryAfterMs }
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = 5,
  windowMs: number = 60_000,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry) {
    store.set(ip, { timestamps: [now] });
    return { allowed: true };
  }

  // Slide the window — remove timestamps older than windowMs
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = windowMs - (now - oldest);
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Extract client IP from a request.
 * Checks x-forwarded-for, x-real-ip, then falls back to "unknown".
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain (original client)
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") || "unknown";
}

// --- Cleanup stale entries every 5 minutes to prevent memory leaks ---
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // Remove entries not seen in 10 minutes
  for (const [ip, entry] of store) {
    const latest = entry.timestamps[entry.timestamps.length - 1] || 0;
    if (now - latest > maxAge) {
      store.delete(ip);
    }
  }
}

setInterval(cleanup, CLEANUP_INTERVAL).unref();
