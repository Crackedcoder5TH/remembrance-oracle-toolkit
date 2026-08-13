/**
 * design.ts — the homepage's visual ground, shared by the consumer pages.
 *
 * The consumer pages were built against the older "cathedral" tokens
 * (teal-cathedral, --text-primary, cathedral-surface) while the homepage was
 * rebuilt around a warm cream ground with gold accents and serif headings. Both
 * were internally consistent, so nothing looked broken in isolation — but
 * following a header link crossed a visible seam into what read as a different
 * site.
 *
 * Only tokens something actually imports live here. A palette module that ships
 * a full set "for later" becomes a second source of truth the moment a page
 * hard-codes a value instead, which is how the seam opened in the first place —
 * so this grows when a page reaches for the next token, not before.
 */

/** Warm cream page ground with the homepage's near-black body text. */
export const PAGE = "min-h-screen bg-[#fbf7f0] text-[#241d15]";
