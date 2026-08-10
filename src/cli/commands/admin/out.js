'use strict';

/**
 * admin/out.js — the ONE output seam for the admin command organs.
 *
 * Decomposition #5 (2026-08-09) funneled 900+ direct console calls from
 * the admin monolith through this door. CLI commands printing is their
 * job — but through one seam, so a logger, a quiet mode, or a redirect
 * is a one-file change instead of a 900-site hunt. This file is the only
 * printing file among the admin organs; the console-ratchet holds every
 * organ at zero.
 *
 * It is also where swallowed failures get their name: _quiet() counts
 * every best-effort catch by site and speaks under ORACLE_DEBUG, so
 * silence became a measurement instead of an absence (silent-catch
 * ratchet, same date).
 */

const fs = require('fs');
const { createGate, requireGate } = require('../../../core/covenant-fractal');

const out = (...a) => { console.log(...a); };
const outErr = (...a) => { console.error(...a); };
const outWarn = (...a) => { console.warn(...a); };

// The admin organs' one filesystem-mutation door. The monolith carried a
// file-level infrastructure exemption; the organs carry none, so their
// single delete (audit baseline --clear) rides a sealed covenant gate
// like every other mutation under the fractal covenant's byte scale.
const _adminFileGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});
const _rmGated = requireGate((gate, target) => fs.unlinkSync(target));
const removeFile = (target) => _rmGated(_adminFileGate(), target);

// Per-site counts of swallowed best-effort failures. Append-only within
// a process; readable for diagnostics; spoken under ORACLE_DEBUG.
const _swallowCounts = new Map();
const _quiet = (site, err) => {
  _swallowCounts.set(site, (_swallowCounts.get(site) || 0) + 1);
  if (process.env.ORACLE_DEBUG) {
    console.warn(`[admin:quiet] ${site}: ${err && err.message ? err.message : err}`);
  }
};
const swallowedFailures = () => Object.fromEntries(_swallowCounts);

module.exports = { out, outErr, outWarn, _quiet, removeFile, swallowedFailures };
