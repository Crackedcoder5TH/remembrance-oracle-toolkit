'use strict';

/**
 * coherency-mapper.js — map a project's structural coherency.
 *
 * FAÇADE. The mapper was a 1,179-line monolith — the flagship
 * decomposition split it into organs under src/core/mapper/, and this
 * module remains the stable public surface so every consumer, test and
 * `goggles --do call oracle/src/core/coherency-mapper.js#<fn>` reference
 * keeps working unchanged:
 *
 *   mapper/config.js        walk rules, categories, aliases, caps
 *   mapper/namespace.js     who is this repo, per the substrate
 *   mapper/flow.js          the coherency-flow reading + the ONE
 *                           sibling engine both map modes share
 *   mapper/pairs.js         duplicate-pair dedupe + payload identity
 *   mapper/deep-map.js      mapProjectCoherency — live re-encode path
 *   mapper/substrate-map.js mapFromSubstrate — read the compression
 *   mapper/format.js        the printed report
 *
 * Every function moved verbatim with its periodic-table declaration;
 * the export surface below is byte-compatible with the monolith's.
 */

const {
  DEFAULT_EXTENSIONS, DEFAULT_SKIP_DIRS, DEFAULT_CATEGORIZER,
  SUBSTRATE_PATH_ALIASES, substrateSelfNames,
} = require('./mapper/config');
const { detectSubstrateNamespace, namespaceFromIndexNames } = require('./mapper/namespace');
const { coherencyFlow, classifyFlow, formatFlow } = require('./mapper/flow');
const { mapProjectCoherency } = require('./mapper/deep-map');
const { mapFromSubstrate } = require('./mapper/substrate-map');
const { formatMap } = require('./mapper/format');

module.exports = {
  mapProjectCoherency,
  mapFromSubstrate,
  namespaceFromIndexNames,
  detectSubstrateNamespace,
  formatMap,
  coherencyFlow,
  classifyFlow,
  formatFlow,
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  DEFAULT_CATEGORIZER,
  SUBSTRATE_PATH_ALIASES,
  substrateSelfNames,
};
