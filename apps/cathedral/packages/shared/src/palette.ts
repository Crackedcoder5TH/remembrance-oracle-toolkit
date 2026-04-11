/**
 * Brand Palette
 *
 * Teal (#00A8A8)      — primary accent, trust, clarity
 * Navy (#1B2D4F)      — depth, authority, trust (header & footer frames)
 * Crimson (#E63946)    — error states, urgency
 * Soft Gray (#F0F2F5)  — clean, neutral canvas
 */
export const palette = {
  teal: "#00A8A8",
  navy: "#1B2D4F",
  indigo: "#1A1B3A",
  crimson: "#E63946",
  bgDeep: "#F0F2F5",
  bgSurface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textMuted: "#5A6377",
} as const;

export type PaletteColor = keyof typeof palette;
