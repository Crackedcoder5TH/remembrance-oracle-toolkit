/**
 * isUuid - Validates whether a string is a valid UUID v4.
 * UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where y is one of 8, 9, a, or b.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid UUID v4
 */
function isUuid(str) {
  if (typeof str !== 'string') return false;
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Pattern.test(str);
}

module.exports = isUuid;
