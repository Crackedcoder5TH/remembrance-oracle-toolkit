/**
 * Lightweight Sentry Error Reporter
 *
 * Uses Sentry's HTTP envelope API directly instead of the heavy @sentry/nextjs SDK.
 * Parses the DSN to extract the project ID, public key, and ingest URL,
 * then sends error events as envelopes via fetch.
 *
 * Environment variable:
 *  - NEXT_PUBLIC_SENTRY_DSN — Sentry DSN string (e.g. "https://key@o123.ingest.sentry.io/456")
 */

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  envelopeUrl: string;
}

let parsedDsn: ParsedDsn | null = null;
let initialized = false;

/**
 * Parse a Sentry DSN into its component parts.
 *
 * DSN format: https://<public_key>@<host>/<project_id>
 * Envelope endpoint: https://<host>/api/<project_id>/envelope/
 */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const host = url.hostname + (url.port ? `:${url.port}` : "");
    const projectId = url.pathname.replace(/\//g, "");

    if (!publicKey || !projectId) return null;

    return {
      publicKey,
      host,
      projectId,
      envelopeUrl: `${url.protocol}//${host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/**
 * Initialize Sentry. Call once at app startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  parsedDsn = parseDsn(dsn);
  if (!parsedDsn) {
    console.warn("[Sentry] Invalid DSN, error reporting disabled.");
  }
}

/**
 * Build a Sentry envelope payload.
 * Envelope format: header\nitem_header\npayload
 * See: https://develop.sentry.dev/sdk/envelopes/
 */
function buildEnvelope(
  event: Record<string, unknown>,
  dsn: ParsedDsn,
): string {
  const envelopeHeader = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    dsn: `https://${dsn.publicKey}@${dsn.host}/${dsn.projectId}`,
    sent_at: new Date().toISOString(),
  });

  const itemHeader = JSON.stringify({
    type: "event",
    content_type: "application/json",
  });

  const payload = JSON.stringify(event);

  return `${envelopeHeader}\n${itemHeader}\n${payload}`;
}

/**
 * Send an event envelope to Sentry.
 */
function sendEnvelope(event: Record<string, unknown>): void {
  if (!parsedDsn) return;

  const body = buildEnvelope(event, parsedDsn);

  // Use sendBeacon for reliability during page unload, fall back to fetch
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const sent = navigator.sendBeacon(parsedDsn.envelopeUrl, body);
    if (sent) return;
  }

  fetch(parsedDsn.envelopeUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
    keepalive: true,
  }).catch(() => {
    // Silently ignore — can't report an error about error reporting
  });
}

/**
 * Extract a clean error message and stack trace from an unknown error value.
 */
function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return { message: String(error) };
}

/**
 * Build a Sentry exception event from a stack trace string.
 */
function parseStackFrames(stack?: string): Array<Record<string, unknown>> {
  if (!stack) return [];

  const lines = stack.split("\n").slice(1); // Skip the error message line
  const frames: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      frames.push({
        function: match[1],
        filename: match[2],
        lineno: parseInt(match[3], 10),
        colno: parseInt(match[4], 10),
      });
      continue;
    }
    const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
    if (simpleMatch) {
      frames.push({
        filename: simpleMatch[1],
        lineno: parseInt(simpleMatch[2], 10),
        colno: parseInt(simpleMatch[3], 10),
      });
    }
  }

  return frames.reverse(); // Sentry expects frames in oldest-to-newest order
}

/**
 * Report an error to Sentry.
 *
 * @param error — The error to report (Error, string, or unknown)
 * @param context — Optional extra context to attach to the event
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!parsedDsn) return;

  const { message, stack } = normalizeError(error);
  const frames = parseStackFrames(stack);

  const event: Record<string, unknown> = {
    platform: "javascript",
    level: "error",
    timestamp: Date.now() / 1000,
    environment: process.env.NODE_ENV || "production",
    request: typeof window !== "undefined" ? { url: window.location.href } : undefined,
    exception: {
      values: [
        {
          type: error instanceof Error ? error.constructor.name : "Error",
          value: message.slice(0, 1000),
          stacktrace: frames.length > 0 ? { frames } : undefined,
        },
      ],
    },
    extra: context,
  };

  sendEnvelope(event);
}

/**
 * Report a message to Sentry.
 *
 * @param message — The message text
 * @param level — Severity level (default: "info")
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!parsedDsn) return;

  const event: Record<string, unknown> = {
    platform: "javascript",
    level,
    timestamp: Date.now() / 1000,
    environment: process.env.NODE_ENV || "production",
    request: typeof window !== "undefined" ? { url: window.location.href } : undefined,
    message: {
      formatted: message.slice(0, 1000),
    },
  };

  sendEnvelope(event);
}
