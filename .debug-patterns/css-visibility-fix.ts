// FIX: Use fixed positioning for always-visible UI elements, not absolute
//
// WRONG — button can be clipped by overflow or scroll:
//   <div className="absolute top-4 right-4">
//
// RIGHT — button stays visible regardless of page structure:
//   <div className="fixed top-4 right-4 z-50">
//
// When a button must always be visible (e.g., Admin Login in top-right):
// 1. Use `fixed` positioning instead of `absolute` — immune to parent overflow
// 2. Add z-index (z-50) to stay above modal overlays and toasts
// 3. Add explicit background color so text is readable over any content
// 4. Add shadow for visual separation from page content
