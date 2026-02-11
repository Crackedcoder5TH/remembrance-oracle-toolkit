/**
 * Zero-dependency ANSI color helpers for CLI output.
 *
 * Colors are automatically disabled when:
 * - stdout is not a TTY (piped/redirected)
 * - NO_COLOR env var is set (https://no-color.org)
 * - --no-color flag is passed
 */

const enabled = process.stdout.isTTY && !process.env.NO_COLOR && !process.argv.includes('--no-color');

const codes = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function wrap(code, text) {
  if (!enabled) return text;
  return `${code}${text}${codes.reset}`;
}

const c = {
  bold: (t) => wrap(codes.bold, t),
  dim: (t) => wrap(codes.dim, t),
  italic: (t) => wrap(codes.italic, t),
  red: (t) => wrap(codes.red, t),
  green: (t) => wrap(codes.green, t),
  yellow: (t) => wrap(codes.yellow, t),
  blue: (t) => wrap(codes.blue, t),
  magenta: (t) => wrap(codes.magenta, t),
  cyan: (t) => wrap(codes.cyan, t),
  white: (t) => wrap(codes.white, t),
  gray: (t) => wrap(codes.gray, t),
  boldGreen: (t) => wrap(codes.bold + codes.green, t),
  boldRed: (t) => wrap(codes.bold + codes.red, t),
  boldYellow: (t) => wrap(codes.bold + codes.yellow, t),
  boldCyan: (t) => wrap(codes.bold + codes.cyan, t),
  boldMagenta: (t) => wrap(codes.bold + codes.magenta, t),
  boldBlue: (t) => wrap(codes.bold + codes.blue, t),
};

/**
 * Color a coherency score based on its value:
 *   >= 0.8  green (excellent)
 *   >= 0.6  yellow (decent)
 *   < 0.6   red (low)
 */
function colorScore(score) {
  if (score == null || score === '?') return c.gray('?');
  const num = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(num)) return c.gray(String(score));
  const text = typeof score === 'number' ? score.toFixed(3) : String(score);
  if (num >= 0.8) return c.boldGreen(text);
  if (num >= 0.6) return c.boldYellow(text);
  return c.boldRed(text);
}

/**
 * Color a decision (PULL/EVOLVE/GENERATE).
 */
function colorDecision(decision) {
  const upper = decision.toUpperCase();
  if (upper === 'PULL') return c.boldGreen(upper);
  if (upper === 'EVOLVE') return c.boldYellow(upper);
  if (upper === 'GENERATE') return c.boldMagenta(upper);
  return c.bold(upper);
}

/**
 * Color an accepted/rejected status.
 */
function colorStatus(accepted) {
  return accepted ? c.boldGreen('Accepted') : c.boldRed('Rejected');
}

/**
 * Color a diff line.
 */
function colorDiff(type, line) {
  if (type === 'added') return c.green(`+ ${line}`);
  if (type === 'removed') return c.red(`- ${line}`);
  return c.gray(`  ${line}`);
}

/**
 * Color a source tag (PAT/HIS).
 */
function colorSource(source) {
  return source === 'pattern' ? c.cyan('PAT') : c.blue('HIS');
}

module.exports = { c, colorScore, colorDecision, colorStatus, colorDiff, colorSource, enabled };
