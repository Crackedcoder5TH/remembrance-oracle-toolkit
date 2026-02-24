/**
 * Security Headers — generates a complete set of HTTP security headers
 * for web applications. HSTS, CSP, X-Frame-Options, etc.
 * @param {object} [options] - Configuration options
 * @param {string} [options.connectSrc] - Additional connect-src domains
 * @param {number} [options.hstsMaxAge] - HSTS max-age in seconds (default: 31536000)
 * @returns {Array<{key: string, value: string}>}
 */
function generateSecurityHeaders(options) {
  const opts = options || {};
  const hstsMaxAge = opts.hstsMaxAge || 31536000;
  const connectSrc = opts.connectSrc ? " " + opts.connectSrc : "";

  return [
    { key: "Strict-Transport-Security", value: "max-age=" + hstsMaxAge + "; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'" + connectSrc,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join("; "),
    },
  ];
}

module.exports = { generateSecurityHeaders };
