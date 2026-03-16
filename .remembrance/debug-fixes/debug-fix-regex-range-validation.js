/**
 * Meta-Pattern 15 Fix: Regex Bypass in Git Range Validation
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "The regex /^[\\w.~^/]+(?:\\.\\.\\.?[\\w.~^/]+)?$/ safely validates
 *              git diff ranges against injection"
 * Reality:    "The regex allows '/' characters, which means a range like
 *              shell-injection patterns are blocked, but
 *              '--output=/tmp/evil' passes because \\w includes letters/digits/underscores
 *              and the regex also allows dots, tildes, carets, and slashes.
 *              More critically, very long inputs cause ReDoS via nested quantifiers."
 *
 * Bug class: Security — regex validation insufficient for shell safety
 * Location:  src/ci/auto-register.js:getChangedFiles() line 37
 *            src/ci/auto-register.js:getAddedCode() line 76
 * Severity:  LOW (mitigated by execFileSync which doesn't use shell) —
 *            BUT the regex gives false confidence. The real protection is
 *            execFileSync, not the regex. If anyone switches to execSync,
 *            the regex won't save them.
 *
 * Also: The regex allows empty string via the optional group, but then
 *       git diff would receive an empty range argument.
 *
 * Fix: Use a strict allowlist and validate the range structurally.
 */

// Before (broken):
// if (!/^[\w.~^/]+(?:\.\.\.?[\w.~^/]+)?$/.test(range)) throw new Error('Invalid git range');

// After (fixed):
function validateGitRange(range) {
  if (!range || typeof range !== 'string') {
    return { valid: false, error: 'Range must be a non-empty string' };
  }
  // Max length to prevent ReDoS
  if (range.length > 200) {
    return { valid: false, error: 'Range too long (max 200 chars)' };
  }
  // Structural validation: must be a ref or ref..ref or ref...ref
  // Refs contain only alphanumeric, dots, tildes, carets, slashes, hyphens
  const REF = '[a-zA-Z0-9][a-zA-Z0-9._~^/\\-]*';
  const pattern = new RegExp(`^${REF}(?:\\.{2,3}${REF})?$`);
  if (!pattern.test(range)) {
    return { valid: false, error: 'Range contains invalid characters' };
  }
  // Block shell metacharacters explicitly (defense in depth)
  if (/[;|&$`"'\\<>(){}!#]/.test(range)) {
    return { valid: false, error: 'Range contains shell metacharacters' };
  }
  return { valid: true, error: null };
}

module.exports = { validateGitRange };
