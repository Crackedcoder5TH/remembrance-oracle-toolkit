/**
 * Normalize phone to digits-only (10-digit US format).
 * Strips non-digit characters and removes leading country code '1'.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}
