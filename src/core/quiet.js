'use strict';

/**
 * quiet — the canonical home for best-effort failures.
 *
 * A `catch (e) {}` that does nothing is not error handling; it is a
 * failure vanishing without a trace. The plain-engineering audit found
 * 462 of them in src/. Many are legitimately best-effort — a field write
 * that must never break its caller — but "best-effort" and "invisible"
 * are not the same thing. This module makes the difference: a swallowed
 * failure still swallows (control flow is unchanged), but it is COUNTED
 * per site and, under ORACLE_DEBUG, spoken. Silence becomes a
 * measurement instead of an absence.
 *
 *   try { risky(); } catch (e) { quiet('module:where', e); }
 *
 * Read the tally any time with quietFailures() — a diagnostic surface,
 * the readable side of the counter, exactly like the admin organs'
 * covenant-status debug view.
 *
 * This is a pure leaf: it requires nothing from the codebase (stdlib
 * only), so it can be required from anywhere without tangling the graph,
 * and its debug output goes to process.stderr directly — not through
 * console.* — so it adds nothing to the print surface the console
 * ratchet governs.
 */

const _counts = new Map();

/**
 * Record a swallowed best-effort failure. Returns nothing and never
 * throws — recording a failure must not itself become one.
 * @param {string} site  - a stable label for WHERE the failure happened
 * @param {*} [err]       - the caught value (optional)
 */
function quiet(site, err) {
  try {
    const key = typeof site === 'string' && site ? site : 'unlabelled';
    _counts.set(key, (_counts.get(key) || 0) + 1);
    if (process.env.ORACLE_DEBUG) {
      const msg = err && err.message ? err.message : (err === undefined ? '' : String(err));
      process.stderr.write(`[quiet] ${key}${msg ? ': ' + msg : ''}\n`);
    }
  } catch (_e) {
    // recording must never throw; if even this fails, stay silent — there
    // is no safe surface left to speak on.
    void _e;
  }
}
quiet.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
};

/** The per-site tally of swallowed failures recorded this process. */
function quietFailures() {
  return Object.fromEntries(_counts);
}
quietFailures.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Reset the tally — for tests and long-lived processes that sample. */
function resetQuiet() {
  _counts.clear();
}
resetQuiet.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

module.exports = { quiet, quietFailures, resetQuiet };
