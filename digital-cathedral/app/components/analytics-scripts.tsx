"use client";

/**
 * Analytics Script Injection — GA4 + Meta Pixel
 *
 * Loads third-party analytics scripts only after the user has accepted
 * cookie consent (checks document.cookie for "cookie-consent=accepted").
 *
 * Environment variables:
 *  - NEXT_PUBLIC_GA_MEASUREMENT_ID  — Google Analytics GA4 measurement ID (e.g. "G-XXXXXXXXXX")
 *  - NEXT_PUBLIC_META_PIXEL_ID      — Meta/Facebook Pixel ID (e.g. "1234567890")
 */

import { useEffect, useState } from "react";
import Script from "next/script";

/** Check if the user has accepted cookie consent (stored in localStorage by cookie-consent component) */
function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem("dc_cookie_consent");
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return parsed.choice === "accepted";
  } catch {
    return false;
  }
}

export function AnalyticsScripts() {
  const [consentGiven, setConsentGiven] = useState(false);

  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

  useEffect(() => {
    // Check consent immediately
    if (hasConsent()) {
      setConsentGiven(true);
      return;
    }

    // Listen for localStorage changes (fires when cookie-consent component saves choice)
    function handleStorage(e: StorageEvent) {
      if (e.key === "dc_cookie_consent" && hasConsent()) {
        setConsentGiven(true);
      }
    }

    // StorageEvent only fires from OTHER tabs; for same-tab, re-check on visibility change
    function handleVisibility() {
      if (!document.hidden && hasConsent()) {
        setConsentGiven(true);
      }
    }

    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);

    // Also dispatch a custom event from cookie-consent for same-tab immediate detection
    function handleCustomConsent() {
      if (hasConsent()) setConsentGiven(true);
    }
    window.addEventListener("cookie-consent-changed", handleCustomConsent);

    return () => {
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("cookie-consent-changed", handleCustomConsent);
    };
  }, []);

  if (!consentGiven) return null;

  return (
    <>
      {/* ─── Google Analytics GA4 ─── */}
      {gaMeasurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga4-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', {
                  page_path: window.location.pathname,
                });
              `,
            }}
          />
        </>
      )}

      {/* ─── Meta / Facebook Pixel ─── */}
      {metaPixelId && (
        <Script
          id="meta-pixel-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `,
          }}
        />
      )}
    </>
  );
}
