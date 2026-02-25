/**
 * Treasury Ledger — Conversion and analytics tracking for the kingdom.
 * Oracle: GENERATE (0.397) — no existing pattern, write new.
 *
 * Privacy-first analytics:
 *  - Checks cookie consent before firing any tracking events
 *  - Supports configurable conversion pixels via env vars
 *  - Tracks: page views, form step progress, conversions
 *  - Extensible: add Google Ads, Facebook Pixel, etc. via gtag/fbq globals
 *
 * No third-party scripts are loaded by default — this provides
 * the event dispatch layer. External pixels are fired only when
 * their global (gtag, fbq) is present on the window.
 */

/** Check if user has accepted analytics cookies */
function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("cookie-consent=accepted");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Safe access to window.gtag (Google Ads / GA4) */
function gtag(...args: unknown[]): void {
  if (typeof window !== "undefined") {
    const w = window as any;
    if (typeof w.gtag === "function") w.gtag(...args);
  }
}

/** Safe access to window.fbq (Meta/Facebook Pixel) */
function fbq(...args: unknown[]): void {
  if (typeof window !== "undefined") {
    const w = window as any;
    if (typeof w.fbq === "function") w.fbq(...args);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ConversionEvent {
  event: string;
  category?: string;
  label?: string;
  value?: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Track a custom analytics event.
 * Respects cookie consent — events are silently dropped if consent is not given.
 */
export function trackEvent(event: ConversionEvent): void {
  if (!hasAnalyticsConsent()) return;

  // Google Analytics / Google Ads
  gtag("event", event.event, {
    event_category: event.category,
    event_label: event.label,
    value: event.value,
    ...event.metadata,
  });

  // Facebook Pixel
  fbq("trackCustom", event.event, {
    category: event.category,
    label: event.label,
    value: event.value,
    ...event.metadata,
  });
}

/**
 * Track a lead form conversion.
 * Fires standard conversion events on all configured pixels.
 */
export function trackConversion(leadId: string, coverageType: string, state: string): void {
  if (!hasAnalyticsConsent()) return;

  // Google Ads conversion
  gtag("event", "conversion", {
    send_to: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID || "",
    event_category: "lead",
    event_label: coverageType,
    value: 1,
  });

  // Facebook Pixel Lead event
  fbq("track", "Lead", {
    content_name: coverageType,
    content_category: "life_insurance",
    status: "submitted",
  });

  // Generic event for any other analytics
  trackEvent({
    event: "lead_submitted",
    category: "conversion",
    label: coverageType,
    value: 1,
    metadata: { leadId, state },
  });
}

/**
 * Track form step progression.
 * Useful for funnel analysis — see where users drop off.
 */
export function trackFormStep(step: number, stepName: string): void {
  trackEvent({
    event: "form_step",
    category: "engagement",
    label: stepName,
    value: step,
  });
}

/**
 * Track page view (for SPA navigation).
 */
export function trackPageView(path: string, title?: string): void {
  if (!hasAnalyticsConsent()) return;

  gtag("event", "page_view", {
    page_path: path,
    page_title: title,
  });

  fbq("track", "PageView");
}
