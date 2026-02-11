function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getAnimationDuration(normalMs, reducedMs) {
  const normal = normalMs || 300;
  const reduced = reducedMs || 0;
  if (typeof window === 'undefined') return normal;
  return prefersReducedMotion() ? reduced : normal;
}

function safeTransition(property, durationMs) {
  if (prefersReducedMotion()) return 'none';
  return property + ' ' + (durationMs || 200) + 'ms ease';
}

module.exports = { prefersReducedMotion, getAnimationDuration, safeTransition };
