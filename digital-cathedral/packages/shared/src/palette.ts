/**
 * Brand Palette
 *
 * Teal (#00A8A8)      — primary accent, trust, clarity
 * Deep Indigo (#1A1B3A) — background depth
 * Crimson (#E63946)    — error states, urgency
 */
export const palette = {
  teal: "#00A8A8",
  indigo: "#1A1B3A",
  crimson: "#E63946",
  bgDeep: "#0F1026",
  bgSurface: "#161833",
  textPrimary: "#E8E8F0",
  textMuted: "#8B8BA8",
} as const;

export type PaletteColor = keyof typeof palette;
