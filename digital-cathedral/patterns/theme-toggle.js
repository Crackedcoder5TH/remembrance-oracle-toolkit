// Theme toggle system — dark/light/system with persistence
// Handles system preference detection, manual override, localStorage

function cycleTheme(current) {
  return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
}

function resolveTheme(theme, systemPref) {
  if (theme === 'system') return systemPref || 'dark';
  return theme;
}

function isValidTheme(value) {
  return value === 'dark' || value === 'light' || value === 'system';
}

module.exports = { cycleTheme, resolveTheme, isValidTheme };
