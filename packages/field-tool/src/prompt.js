'use strict';

const readline = require('node:readline');

/**
 * Ask a yes/no question. Resolution order:
 *   force === true   -> resolve true   (e.g. --yes)
 *   force === false  -> resolve false  (e.g. --no)
 *   non-interactive  -> resolve defaultValue (privacy-safe; default false)
 *   interactive TTY  -> actually prompt the user
 *
 * @param {string} question
 * @param {{force?:boolean, defaultValue?:boolean}} [opts]
 * @returns {Promise<boolean>}
 */
function confirm(question, { force, defaultValue = false } = {}) {
  if (force === true) return Promise.resolve(true);
  if (force === false) return Promise.resolve(false);
  if (!process.stdin.isTTY) return Promise.resolve(defaultValue);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} ${defaultValue ? '[Y/n]' : '[y/N]'} `, (ans) => {
      rl.close();
      const a = String(ans || '').trim().toLowerCase();
      if (a === '') return resolve(defaultValue);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

module.exports = { confirm };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
confirm.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
