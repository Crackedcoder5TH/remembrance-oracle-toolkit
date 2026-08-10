'use strict';

/**
 * library/out.js — the ONE output + file-write seam for the library organs.
 *
 * Decomposition (2026-08-10) split the ~1650-line library command monolith
 * into six domain organs (inspect, resolve, exchange, evolve, compress,
 * publish). Those organs print — a CLI's job — but through this single door,
 * so a logger, a quiet mode, or a redirect is a one-file change instead of a
 * 270-site hunt. This is the only printing file among the library organs; the
 * console-ratchet holds every organ at zero.
 *
 * The monolith also carried a file-level infrastructure exemption for its one
 * filesystem write (`oracle export --file`). The organs carry none, so that
 * write rides a sealed covenant gate here — the same shape admin/out.js uses
 * for its one delete — and the exemption surface shrinks by one file. (This
 * comment says "infrastructure exemption" in prose deliberately, without the
 * literal annotation token, so the exemption scanner does not read the seam
 * as itself exempt — the law reads code, not prose about code.)
 */

const fs = require('fs');
const { createGate, requireGate } = require('../../../core/covenant-fractal');

const out = (...a) => { console.log(...a); };
const outErr = (...a) => { console.error(...a); };
const outWarn = (...a) => { console.warn(...a); };

// The library organs' one filesystem-mutation door: `oracle export --file`
// writes the chosen patterns out. It rides a sealed covenant gate so the byte
// scale of the fractal covenant witnesses the write, exactly as every other
// governed mutation does — no file-level exemption required.
const _libraryFileGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});
const _writeGated = requireGate((gate, target, data) => fs.writeFileSync(target, data, 'utf-8'));
const writeFile = (target, data) => _writeGated(_libraryFileGate(), target, data);

module.exports = { out, outErr, outWarn, writeFile };
