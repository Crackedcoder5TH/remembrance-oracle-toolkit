/**
 * Cookie Consent Banner — localStorage-based consent tracker.
 * No third-party cookies or trackers.
 * @param {string} storageKey - localStorage key for consent state
 * @returns {{ hasConsented, acceptConsent, resetConsent }}
 */
function createCookieConsent(storageKey) {
  const key = storageKey || 'cookie-consent';

  function hasConsented() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(key) === 'accepted';
    } catch {
      return false;
    }
  }

  function acceptConsent() {
    try {
      localStorage.setItem(key, 'accepted');
      return true;
    } catch {
      return false;
    }
  }

  function resetConsent() {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  return { hasConsented, acceptConsent, resetConsent };
}

module.exports = { createCookieConsent };
