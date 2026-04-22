'use strict';

/**
 * Input validators — covenant-domain elements. Group 12 filter/group 2
 * comparison, contracting charge (-1) because validators reduce.
 */

function validatePath(inputPath, baseDir) {
  if (typeof inputPath !== 'string') return { valid: false, reason: 'not-string' };
  if (inputPath.includes('\0')) return { valid: false, reason: 'null-byte' };
  if (/(\.\.[\/\\])|^[\/\\]/.test(inputPath)) return { valid: false, reason: 'traversal' };
  const path = require('path');
  const resolved = path.resolve(baseDir || '.', inputPath);
  const base = path.resolve(baseDir || '.');
  if (!resolved.startsWith(base)) return { valid: false, reason: 'escapes-base', resolved };
  return { valid: true, resolved };
}
validatePath.atomicProperties = {
  charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function validateUrl(url, allowedProtocols = ['https:']) {
  if (typeof url !== 'string') return { valid: false, reason: 'not-string' };
  try {
    const u = new URL(url);
    if (!allowedProtocols.includes(u.protocol)) return { valid: false, reason: 'protocol-not-allowed', protocol: u.protocol };
    const hostname = u.hostname;
    if (/^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|::1|fc|fd)/.test(hostname) || hostname === 'localhost') {
      return { valid: false, reason: 'private-or-loopback-address', hostname };
    }
    return { valid: true, parsed: { protocol: u.protocol, hostname, pathname: u.pathname } };
  } catch {
    return { valid: false, reason: 'unparseable' };
  }
}
validateUrl.atomicProperties = {
  charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function validateJsonSafely(text, opts = {}) {
  if (typeof text !== 'string') return { valid: false, reason: 'not-string' };
  const maxLen = opts.maxLength || 100000;
  const maxDepth = opts.maxDepth || 20;
  if (text.length > maxLen) return { valid: false, reason: 'too-long', length: text.length };
  let depth = 0, maxSeen = 0;
  for (const ch of text) {
    if (ch === '{' || ch === '[') { depth++; if (depth > maxSeen) maxSeen = depth; }
    else if (ch === '}' || ch === ']') depth--;
    if (maxSeen > maxDepth) return { valid: false, reason: 'too-deep', depth: maxSeen };
  }
  try {
    return { valid: true, value: JSON.parse(text), depth: maxSeen };
  } catch (e) {
    return { valid: false, reason: 'parse-error', message: e.message };
  }
}
validateJsonSafely.atomicProperties = {
  charge: -1, valence: 1, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { validatePath, validateUrl, validateJsonSafely };
