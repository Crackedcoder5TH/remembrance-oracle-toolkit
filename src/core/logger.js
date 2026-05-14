/**
 * Structured logger for the oracle system.
 * Replaces scattered ORACLE_DEBUG console.warn/error calls with
 * consistent, filterable, structured log output.
 *
 * Usage:
 *   const log = require('./logger');
 *   log.warn('subsystem', 'message', { key: 'value' });
 *   log.error('subsystem', 'message', err);
 *   log.debug('subsystem', 'message');
 */

const ENABLED = !!process.env.ORACLE_DEBUG;
const LOG_LEVEL = (process.env.ORACLE_LOG_LEVEL || 'warn').toLowerCase();

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[LOG_LEVEL] ?? LEVELS.warn;

function _format(level, subsystem, message, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${subsystem}] ${message}`;
  if (meta && typeof meta === 'object' && !(meta instanceof Error)) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  if (meta instanceof Error) {
    return `${base} ${meta.message}`;
  }
  return base;
}

function _log(level, subsystem, message, meta) {
  if (!ENABLED) return;
  if (LEVELS[level] < minLevel) return;

  const formatted = _format(level, subsystem, message, meta);
  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

module.exports = {
  debug: (subsystem, message, meta) => _log('debug', subsystem, message, meta),
  info: (subsystem, message, meta) => _log('info', subsystem, message, meta),
  warn: (subsystem, message, meta) => _log('warn', subsystem, message, meta),
  error: (subsystem, message, meta) => _log('error', subsystem, message, meta),
  isEnabled: () => ENABLED,
};
