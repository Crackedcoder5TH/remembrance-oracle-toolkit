/**
 * Email validation — pulled from Remembrance Oracle (coherency: 1.000)
 * Pattern: validate-email [b0662ceff51d409b]
 * Tags: validation, email, regex, input, sanitize
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}
