/**
 * Shared lazy-require helpers for reflector report modules.
 *
 * Avoids circular dependencies between report-*.js modules by deferring
 * requires until first use. Centralizes the pattern that was previously
 * duplicated across 7 files (17 instances).
 */

const cache = Object.create(null);

function lazy(name, loader) {
  if (!cache[name]) cache[name] = loader();
  return cache[name];
}

module.exports = {
  scoring:       () => lazy('scoring',       () => require('./scoring')),
  multi:         () => lazy('multi',         () => require('./multi')),
  github:        () => lazy('github',        () => require('./report-github')),
  history:       () => lazy('history',       () => require('./report-history')),
  patternHook:   () => lazy('patternHook',   () => require('./report-pattern-hook')),
  notifications: () => lazy('notifications', () => require('./report-notifications')),
  autocommit:    () => lazy('autocommit',    () => require('./report-autocommit')),
  safety:        () => lazy('safety',        () => require('./report-safety')),
};
