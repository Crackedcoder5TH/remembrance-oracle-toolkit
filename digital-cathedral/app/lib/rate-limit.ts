/**
 * IP-Based Rate Limiter — Vercel KV (primary) with in-memory fallback
 *
 * Backends:
 *  1. Vercel KV / Upstash Redis — when KV_REST_API_URL + KV_REST_API_TOKEN are
 *     present in the environment. Uses a Redis sorted set per key with
 *     timestamp scores and a single pipelined REST round-trip per check.
 *     This is the production path: shared across every Lambda instance, so
 *     the configured limit is the real limit no matter how many Lambdas
 *     handle traffic.
 *  2. In-memory Map — local dev / self-hosted without KV. Same sliding-window
 *     algorithm as before. Module-scoped, so it fragments under multi-Lambda
 *     deploys (this is the behaviour the KV path replaces).
 *
 * KV is also used as a transparent fallback for fail-open: if the KV REST
 * call errors or times out, the in-memory limiter takes over for that
 * request. Better to over-allow under partial KV outage than to lock every
 * caller out.
 *
 * Vercel auto-injects KV_REST_API_URL + KV_REST_API_TOKEN when a KV store
 * is linked to the project — no manual env var typing needed in that path.
 */

interface RateLimitEntry {
  timestamps: number[];
}

type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const HAS_KV = Boolean(KV_URL && KV_TOKEN);
const KV_TIMEOUT_MS = 500;

/**
 * Check if an IP (or any string key) is rate-limited.
 * Async because the production path hits Vercel KV over HTTP. The in-memory
 * fallback resolves synchronously inside the same Promise.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = 5,
  windowMs: number = 60_000,
): Promise<RateLimitResult> {
  if (HAS_KV) {
    try {
      return await checkRateLimitKv(key, maxRequests, windowMs);
    } catch {
      // KV unreachable — fail-open to in-memory so we don't 500 the world.
      return checkRateLimitMemory(key, maxRequests, windowMs);
    }
  }
  return checkRateLimitMemory(key, maxRequests, windowMs);
}

/** Vercel KV / Upstash Redis sliding-window via single pipelined REST call. */
async function checkRateLimitKv(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const namespaced = `rl:${key}`;
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const ttlSeconds = Math.ceil(windowMs / 1000) + 1;

  const pipeline = [
    ["ZREMRANGEBYSCORE", namespaced, 0, now - windowMs],
    ["ZADD", namespaced, now, member],
    ["ZCARD", namespaced],
    ["ZRANGE", namespaced, 0, 0, "WITHSCORES"],
    ["EXPIRE", namespaced, ttlSeconds],
  ];

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), KV_TIMEOUT_MS);

  let raw: unknown;
  try {
    const res = await fetch(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`KV ${res.status}`);
    }
    raw = await res.json();
  } finally {
    clearTimeout(t);
  }

  // Upstash pipeline returns [{result: ...}, {result: ...}, ...]
  const results = Array.isArray(raw) ? raw : [];
  const cardEntry = results[2] as { result?: unknown } | undefined;
  const count = Number(cardEntry?.result ?? 0);

  if (count > maxRequests) {
    const oldestEntry = results[3] as { result?: unknown } | undefined;
    const oldestArr = oldestEntry?.result;
    const oldestScore =
      Array.isArray(oldestArr) && oldestArr.length >= 2 ? Number(oldestArr[1]) : now;
    const retryAfterMs = Math.max(1, windowMs - (now - oldestScore));
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

/** In-memory sliding window — used for local dev and as KV fail-open fallback. */
function checkRateLimitMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    // Evict oldest entry if store is at capacity
    if (store.size >= MAX_STORE_SIZE) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(key, { timestamps: [now] });
    return { allowed: true };
  }

  // Slide the window — remove timestamps older than windowMs
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
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

/** Reports the active backend — exported for ops/health checks. */
export function getRateLimitBackend(): "kv" | "memory" {
  return HAS_KV ? "kv" : "memory";
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
