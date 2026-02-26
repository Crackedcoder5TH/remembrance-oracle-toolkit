/**
 * useUtmTracking — Capture and persist UTM parameters across the session.
 *
 * Captures utm_source, utm_medium, utm_campaign, utm_term, utm_content
 * from the URL on first load, persists them in sessionStorage so they
 * survive navigation within the site. Exposes them for form submission.
 *
 * Also captures referrer and landing page for attribution.
 */
import { useEffect, useState } from "react";

export interface UtmParams {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  referrer: string | null;
  landingPage: string | null;
}

const STORAGE_KEY = "cathedral_utm";

const UTM_KEYS = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_term", "utmTerm"],
  ["utm_content", "utmContent"],
] as const;

function captureFromUrl(): UtmParams {
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    referrer: document.referrer || null,
    landingPage: window.location.href,
  };

  for (const [urlKey, stateKey] of UTM_KEYS) {
    const value = params.get(urlKey);
    if (value) {
      utm[stateKey] = value;
    }
  }

  return utm;
}

function loadFromStorage(): UtmParams | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveToStorage(utm: UtmParams): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Storage unavailable — silent fail
  }
}

export function useUtmTracking(): UtmParams {
  const [utm, setUtm] = useState<UtmParams>({
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    referrer: null,
    landingPage: null,
  });

  useEffect(() => {
    // Priority: URL params (fresh click) > sessionStorage (persisted)
    const fromUrl = captureFromUrl();
    const hasUrlUtm = UTM_KEYS.some(([_, key]) => fromUrl[key] !== null);

    if (hasUrlUtm) {
      // Fresh click with UTM params — save and use
      saveToStorage(fromUrl);
      setUtm(fromUrl);
    } else {
      // No UTM in URL — check session storage
      const stored = loadFromStorage();
      if (stored) {
        setUtm(stored);
      } else {
        // First visit with no UTM — save referrer/landing page
        saveToStorage(fromUrl);
        setUtm(fromUrl);
      }
    }
  }, []);

  return utm;
}
