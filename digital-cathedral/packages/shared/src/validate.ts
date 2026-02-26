/**
 * Email validation.
 * Tags: validation, email, regex, input, sanitize
 */
export function validateEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 254;
}
