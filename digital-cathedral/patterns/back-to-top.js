// Back-to-top — scroll-to-top with throttled visibility detection
// Appears after scrolling past threshold, smooth scrolls to top

function createBackToTop(threshold = 300, throttleMs = 150) {
  let visible = false;
  let lastCall = 0;

  function checkVisibility() {
    const now = Date.now();
    if (now - lastCall < throttleMs) return visible;
    lastCall = now;
    visible = (typeof window !== 'undefined') && window.scrollY > threshold;
    return visible;
  }

  function scrollToTop() {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return { checkVisibility, scrollToTop, get visible() { return visible; } };
}

module.exports = { createBackToTop };
