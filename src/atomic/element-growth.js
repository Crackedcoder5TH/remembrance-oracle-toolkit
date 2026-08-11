'use strict';

/**
 * element-growth — the periodic table's growth door.
 *
 * codex-ingest renders approved lexicon proposals into
 * src/atomic/periodic-table-additions.js as a list of registerElement({...})
 * calls, and that generated file requires the name from a sibling module.
 * The name was never defined anywhere: the first active proposal would have
 * thrown `TypeError: registerElement is not a function` at require time. It
 * stayed quiet only because the element count has been 0 since the file was
 * generated — a growth path that had never grown.
 *
 * The door lives here rather than inside periodic-table.js for two reasons
 * the gates gave, not preferences:
 *
 *   the size ratchet — periodic-table.js is a grandfathered monolith, and
 *   adding the door inline grew it past its slack. A new capability belongs
 *   in a new organ, not bolted onto the largest file that could hold it.
 *
 *   the orphan ratchet — the canonical table path had no consumer as a
 *   public export. Here it is module-internal, reached only through
 *   defaultTable(), which is what actually needs it.
 *
 * Dependency runs one way only — element-growth → periodic-table — so the
 * door adds no cycle to the graph it was born into.
 */

const path = require('path');
const { PeriodicTable } = require('./periodic-table');

// Where `oracle atomic table` looks. Growth that lands anywhere else is
// growth nobody can see.
const CANONICAL_TABLE_PATH = path.join(process.cwd(), '.remembrance', 'atomic-table.json');

// Identity fields travel beside the 13 atomic properties in a generated
// call; they describe the element, they are not part of its signature.
const ELEMENT_META_KEYS = new Set(['name', 'source', 'approvedAt', 'code', 'patternId', 'isEmergent']);

let _defaultTable = null;

/** The process-wide table the growth door writes into. */
function defaultTable() {
  if (!_defaultTable) _defaultTable = new PeriodicTable({ storagePath: CANONICAL_TABLE_PATH });
  return _defaultTable;
}
defaultTable.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};

/**
 * Admit one element into the periodic table.
 *
 * The properties go to addElement, which is where the covenant gate already
 * lives — so a proposal carrying dangerous / degrading / malevolent
 * properties is REJECTED at the door rather than admitted quietly. Growth
 * without a gate is not growth, it is accumulation.
 *
 * @param {object} spec - flat: { name, source, approvedAt, ...13 properties }
 * @param {PeriodicTable} [table] - defaults to the canonical on-disk table
 * @returns {object} the registered element, or { rejected, violations }
 */
function registerElement(spec = {}, table = defaultTable()) {
  const props = {};
  const meta = {};
  for (const [k, v] of Object.entries(spec)) {
    if (ELEMENT_META_KEYS.has(k)) meta[k] = v;
    else props[k] = v;
  }
  if (!meta.source) meta.source = 'codex-ingest';
  return table.addElement(props, meta);
}
registerElement.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'core',
};

module.exports = { registerElement, defaultTable };
