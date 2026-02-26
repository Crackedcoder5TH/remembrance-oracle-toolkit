/**
 * isSemver - Validates whether a string is a valid semantic version.
 * Follows the semver 2.0.0 specification: MAJOR.MINOR.PATCH with optional
 * pre-release and build metadata identifiers.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid semantic version
 */
function isSemver(str) {
  if (typeof str !== 'string') return false;
  const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverPattern.test(str);
}

module.exports = isSemver;
