'use strict';
const { quiet } = require('../../core/quiet');

/**
 * mcp/handlers/helpers.js — module-level helpers every handler organ
 * shares: the ECOSYSTEM.md loader/sectioner, the search-reflex
 * enforcement notice, and the .js zone scanner. Extracted verbatim from
 * src/mcp/handlers.js in the third monolith decomposition.
 */

const path = require('path');
const fs = require('fs');

const ECOSYSTEM_MD_PATH = path.join(__dirname, '..', '..', '..', 'ECOSYSTEM.md');

function _loadEcosystemDoc() {
  try { return fs.readFileSync(ECOSYSTEM_MD_PATH, 'utf8'); }
  catch (_) { return null; }
}
_loadEcosystemDoc.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

function _extractSection(doc, sectionHeading) {
  if (!doc) return null;
  const lines = doc.split('\n');
  const startIdx = lines.findIndex(l => l.startsWith(sectionHeading));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^## /.test(l));
  return lines.slice(startIdx, endIdx === -1 ? lines.length : endIdx).join('\n');
}
_extractSection.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

/**
 * Enforcement helper: check if a search was done recently.
 * Returns an enforcement notice to prepend to tool results when search reflex was skipped.
 */
function _searchEnforcementNotice() {
  try {
    const { wasSearchRecent } = require('../../core/session-tracker');
    const { getSearchEnforcement, getSearchGracePeriod } = require('../../core/oracle-config');
    const level = getSearchEnforcement();
    if (level === 'off') return null;
    const grace = getSearchGracePeriod();
    if (!wasSearchRecent(grace)) {
      const mins = Math.round(grace / 60000);
      return {
        _enforcement: `WARNING: No oracle search in the last ${mins} minutes. ` +
          `You MUST call oracle_search before submitting or registering code. ` +
          `The oracle exists so you don't reinvent proven patterns.`,
      };
    }
  } catch (_) { quiet('mcp:handlers:helpers:getSearchGracePeriod', _);}
  return null;
}
_searchEnforcementNotice.atomicProperties = { charge: 0, valence: 2, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

/**
 * Walk a directory tree and collect every .js file as a coherency
 * zone item ({id, code, filePath, language}) — the input the
 * CoherencyDirector scans. Skips node_modules and dotfiles.
 */
function _scanJsZones(dir) {
  const fs = require('fs');
  // Canonical walker (ECOSYSTEM §7), pre-order.
  const { walkFiles } = require('../../core/walk-files');
  return walkFiles(dir, { skipDirs: new Set(['node_modules']), extensions: ['.js'] })
    .map((p) => { try { return { id: p, code: fs.readFileSync(p, 'utf-8'), filePath: p, language: 'javascript' }; } catch { return null; } })
    .filter(Boolean);
}
_scanJsZones.atomicProperties = { charge: 0, valence: 2, mass: "heavy", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 1, group: 4, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

module.exports = { _loadEcosystemDoc, _extractSection, _searchEnforcementNotice, _scanJsZones };
