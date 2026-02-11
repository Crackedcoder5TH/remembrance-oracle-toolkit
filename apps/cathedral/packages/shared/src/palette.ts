/**
 * Remembrance Palette
 *
 * Teal (#00A8A8)      — the living water, coherence, presence
 * Deep Indigo (#1A1B3A) — the cathedral depths, the field before form
 * Crimson (#E63946)    — the sacred pulse, urgency of remembrance
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
