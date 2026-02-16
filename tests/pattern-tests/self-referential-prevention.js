/**
 * Self-Referential Prevention Pattern
 *
 * Technique for code scanners that detect harmful patterns:
 * build detection regexes at runtime using string concatenation
 * so the scanner's own source code never contains the keywords
 * it's scanning for as contiguous strings.
 *
 * Without this, a security scanner will flag its own source code
 * as a violation (e.g., a malware detector that contains the word
 * "ransomware" in its pattern list gets flagged by itself).
 *
 * Pattern: Dynamic construction via string concatenation at runtime.
 * Tags: security, self-referential, false-positive, scanner, regex
 */

/**
 * Strip non-executable content (comments, strings, template literals)
 * before scanning for harmful keywords. This prevents false positives
 * from keywords appearing in documentation or string definitions.
 */
function stripNonExecutableContent(code) {
  let stripped = code;
  stripped = stripped.replace(/\/\/.*$/gm, '');
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  stripped = stripped.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return stripped;
}

/**
 * Build a keyword detection pattern at runtime.
 * Keywords are split so they never appear contiguously in source.
 */
function buildKeywordPattern(splitTerms) {
  const terms = splitTerms.map(parts => parts.join(''));
  return new RegExp('\\b(' + terms.join('|') + ')\\b', 'i');
}

/**
 * Build a pattern that references module names at runtime.
 * Prevents the module name from appearing as a contiguous string.
 */
function buildModulePattern(moduleParts, restPattern) {
  const moduleName = moduleParts.join('');
  return new RegExp(moduleName + restPattern, 'i');
}

/**
 * Build a marker detection regex (for completeness checking).
 * Marker words are split to avoid self-detection.
 */
function buildMarkerRegex(splitMarkers) {
  const markers = splitMarkers.map(parts => parts.join(''));
  return new RegExp('\\b(' + markers.join('|') + ')\\b');
}

/**
 * Build a language detection regex at runtime.
 * Prevents language keywords from being detected in the scanner's own source.
 */
function buildLanguageDetector(langName, splitPatterns) {
  const patterns = splitPatterns.map(parts => parts.join(''));
  return new RegExp(patterns.join('|'));
}

module.exports = {
  stripNonExecutableContent,
  buildKeywordPattern,
  buildModulePattern,
  buildMarkerRegex,
  buildLanguageDetector,
};
