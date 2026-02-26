/**
 * Structured Logging
 *
 * Features:
 *  - Unique request IDs for tracing
 *  - Log levels: debug, info, warn, error
 *  - Structured JSON in production, human-readable in dev
 *  - Request timing helper for API routes
 *  - Contextual metadata (route, method, status, duration)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  process.env.LOG_LEVEL as LogLevel || (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/** Generate a short unique request ID */
export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `req_${ts}_${rand}`;
}

function formatDev(entry: LogEntry): string {
  const { timestamp, level, message, requestId, ...rest } = entry;
  const prefix = requestId ? `[${requestId}]` : "";
  const extras = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${message}${extras}`;
}

function emit(entry: LogEntry): void {
  const output = IS_PRODUCTION ? JSON.stringify(entry) : formatDev(entry);

  switch (entry.level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  emit({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

/**
 * Create a scoped logger with a request ID baked in.
 * Use in API routes for consistent request tracing.
 */
export function createRequestLogger(requestId?: string) {
  const rid = requestId || generateRequestId();

  return {
    requestId: rid,
    debug: (message: string, meta?: Record<string, unknown>) =>
      log("debug", message, { requestId: rid, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      log("info", message, { requestId: rid, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log("warn", message, { requestId: rid, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      log("error", message, { requestId: rid, ...meta }),
  };
}

/**
 * Time a request and log the result.
 * Returns the logger for use during the request and a finish() to log completion.
 */
export function startRequestTimer(method: string, path: string, requestId?: string) {
  const logger = createRequestLogger(requestId);
  const start = Date.now();

  logger.info("Request started", { method, path });

  return {
    logger,
    finish: (status: number, extra?: Record<string, unknown>) => {
      const durationMs = Date.now() - start;
      const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      log(level, "Request completed", {
        requestId: logger.requestId,
        method,
        path,
        status,
        durationMs,
        ...extra,
      });
    },
  };
}

/** Module-level logger for non-request contexts (startup, cron, etc.) */
export const herald = {
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
