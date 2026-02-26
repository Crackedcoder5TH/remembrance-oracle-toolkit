"use client";

/**
 * CookieConsent — CCPA/CPRA compliant cookie consent banner.
 *
 * Compliance coverage:
 *  - California (CCPA/CPRA) — opt-out of sale/sharing
 *  - Colorado (CPA) — opt-out rights
 *  - Connecticut (CTDPA) — consent for non-essential cookies
 *  - Virginia (VCDPA) — opt-out rights
 *
 * Stores consent choice in localStorage. Shows only once unless
 * the user clicks "Manage Cookies" in the footer.
 */
import { useState, useEffect } from "react";

const STORAGE_KEY = "dc_cookie_consent";

type ConsentChoice = "accepted" | "rejected" | "essential-only" | null;

interface ConsentState {
  choice: ConsentChoice;
  timestamp: string;
}

function loadConsent(): ConsentState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ choice, timestamp: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const existing = loadConsent();
    if (!existing || !existing.choice) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleAccept() {
    saveConsent("accepted");
    setVisible(false);
  }

  function handleEssentialOnly() {
    saveConsent("essential-only");
    setVisible(false);
  }

  function handleReject() {
    saveConsent("rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto cathedral-surface p-5 md:p-6 shadow-lg border border-navy-cathedral/10">
        <div className="space-y-4">
          {/* Main message */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Cookie Preferences
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              We use cookies to improve your experience, analyze site traffic, and personalize content.
              Essential cookies are required for the site to function. You can choose to accept all cookies,
              accept only essential cookies, or reject non-essential cookies.
            </p>
          </div>

          {/* Details toggle */}
          {showDetails && (
            <div className="space-y-3 border-t border-navy-cathedral/8 pt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Essential Cookies</span>
                  <span className="text-xs text-emerald-accent">Always Active</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Required for the website to function. Includes session management and security.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Analytics Cookies</span>
                  <span className="text-xs text-[var(--text-muted)]">Optional</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Help us understand how visitors interact with our site to improve the experience.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Marketing Cookies</span>
                  <span className="text-xs text-[var(--text-muted)]">Optional</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Used to deliver relevant advertisements. May be shared with advertising partners.
                  Under California law (CCPA/CPRA), this may constitute a &ldquo;sale&rdquo; or &ldquo;sharing&rdquo;
                  of personal information.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAccept}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-accent text-white hover:bg-emerald-accent/90 transition-all"
            >
              Accept All
            </button>
            <button
              onClick={handleEssentialOnly}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25 transition-all"
            >
              Essential Only
            </button>
            <button
              onClick={handleReject}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25 transition-all"
            >
              Reject All
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-emerald-accent underline ml-auto"
            >
              {showDetails ? "Hide Details" : "Cookie Details"}
            </button>
          </div>

          {/* Privacy policy link */}
          <p className="text-xs text-[var(--text-muted)]">
            Learn more in our{" "}
            <a href="/privacy" className="text-emerald-accent underline">Privacy Policy</a>.
            California residents:{" "}
            <a href="/privacy#do-not-sell" className="text-emerald-accent underline">
              Do Not Sell or Share My Personal Information
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
