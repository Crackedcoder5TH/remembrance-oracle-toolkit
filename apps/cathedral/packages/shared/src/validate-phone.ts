/**
 * Phone validation.
 * Accepts US phone formats: (555) 123-4567, 555-123-4567, 5551234567, +15551234567
 */
export function validatePhone(phone: string): boolean {
  if (typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith("1")) return true;
  return false;
}
