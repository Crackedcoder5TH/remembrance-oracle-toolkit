/**
 * Name validation — validates a human first or last name.
 * Accepts 2-100 characters: letters, spaces, apostrophes, hyphens, periods, commas.
 * Rejects script injection and non-alpha characters.
 */
export function validateName(name: string): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && /^[a-zA-Z\s'.,-]+$/.test(trimmed);
}
