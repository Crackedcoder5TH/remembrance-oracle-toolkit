"use client";

/**
 * Watchtower — Client-side error reporting for the kingdom.
 * Oracle: GENERATE (0.386) — no existing pattern, write new.
 *
 * Catches unhandled errors and promise rejections in the browser,
 * deduplicates them, and sends batched reports to /api/errors.
 * Mount this once in the root layout.
 */

import { useEffect } from "react";

interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  url: string;
  userAgent: string;
  timestamp: string;
  type: "error" | "unhandledrejection";
}

// Dedup: track sent error messages to avoid flooding
const sentErrors = new Set<string>();
const MAX_TRACKED = 50;
const REPORT_ENDPOINT = "/api/errors";

function sendReport(report: ErrorReport): void {
  // Deduplicate by message
  const key = `${report.type}:${report.message}`;
  if (sentErrors.has(key)) return;
  if (sentErrors.size >= MAX_TRACKED) return; // Rate limit total reports
  sentErrors.add(key);

  // Use sendBeacon for reliability (works even during page unload)
  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(REPORT_ENDPOINT, JSON.stringify(report));
  } else {
    fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {
      // Silently ignore — can't report an error about error reporting
    });
  }
}

function buildReport(
  type: "error" | "unhandledrejection",
  message: string,
  extra?: Partial<ErrorReport>,
): ErrorReport {
  return {
    type,
    message: message.slice(0, 1000), // Limit message length
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * ErrorReporter — invisible component that installs global error handlers.
 * Add to your root layout: <ErrorReporter />
 */
export function ErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      sendReport(
        buildReport("error", event.message || "Unknown error", {
          stack: event.error?.stack?.slice(0, 2000),
          source: event.filename,
          line: event.lineno,
          col: event.colno,
        }),
      );
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      sendReport(
        buildReport("unhandledrejection", message, {
          stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined,
        }),
      );
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null; // Invisible component
}
