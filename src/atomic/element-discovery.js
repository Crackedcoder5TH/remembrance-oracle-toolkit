'use strict';

/**
 * Element Discovery — finds unrealized property combinations in
 * the periodic table and generates specifications for filling them.
 *
 * Three discovery strategies:
 *
 *   1. NEIGHBOR GAP — for each realized element, vary one property
 *      at a time. Unrealized neighbors with many realized neighbors
 *      are high-priority gaps (the surrounding space is well-explored).
 *
 *   2. GROUP COMPLETION — for each functional group (1-18), find
 *      property combinations that exist in OTHER groups but not this
 *      one. A "filter" that exists as light/inert/even but not as
 *      heavy/high/odd is a gap worth filling.
 *
 *   3. INTERACTION PREDICTION — find pairs of realized elements
 *      whose interaction coherence is high but whose "compound"
 *      (the element that would result from combining their properties)
 *      doesn't exist yet. These are predicted-useful elements.
 *
 * The discovery output is a list of element specifications that
 * the oracle's generation pipeline (swarm) can turn into code.
 */

const { encodeSignature, GROUPS, CHARGE_VALUES, MASS_VALUES, SPIN_VALUES,
  PHASE_VALUES, REACTIVITY_VALUES, HARM_VALUES, ALIGNMENT_VALUES, INTENTION_VALUES,
  MAX_GROUP, MAX_PERIOD, CovenantValidator } = require('./periodic-table');

/**
 * Run all three discovery strategies and return a ranked list
 * of predicted elements.
 *
 * @param {PeriodicTable} table - the current periodic table
 * @param {object} [options]
 *   - maxResults: total results across all strategies (default 50)
 *   - strategies: array of strategy names to run (default all three)
 * @returns {Array<ElementPrediction>}
 */
function runDiscovery(table, options = {}) {
  const maxResults = options.maxResults || 50;
  const strategies = options.strategies || ['neighbor', 'group', 'interaction'];

  const predictions = [];

  if (strategies.includes('neighbor')) {
    predictions.push(...neighborGapDiscovery(table, { maxResults: Math.ceil(maxResults * 0.5) }));
  }
  if (strategies.includes('group')) {
    predictions.push(...groupCompletionDiscovery(table, { maxResults: Math.ceil(maxResults * 0.3) }));
  }
  if (strategies.includes('interaction')) {
    predictions.push(...interactionPredictionDiscovery(table, { maxResults: Math.ceil(maxResults * 0.2) }));
  }

  // Deduplicate by signature, keep highest priority
  const bySignature = new Map();
  for (const pred of predictions) {
    const existing = bySignature.get(pred.signature);
    if (!existing || pred.priority > existing.priority) {
      bySignature.set(pred.signature, pred);
    }
  }

  return Array.from(bySignature.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxResults);
}

/**
 * Strategy 1: Neighbor Gap Discovery.
 * Uses the periodic table's built-in findGaps method.
 */
function neighborGapDiscovery(table, options = {}) {
  const gaps = table.findGaps({
    maxGaps: options.maxResults || 25,
    minNeighborCount: 2,
  });

  return gaps.map(gap => ({
    signature: gap.signature,
    properties: gap.properties,
    priority: gap.priority,
    strategy: 'neighbor',
    description: buildDescription(gap.properties),
    generationSpec: buildGenerationSpec(gap.properties),
  }));
}

/**
 * Strategy 2: Group Completion Discovery.
 * For each group, find property combinations that exist in at least
 * 2 other groups but not in this one.
 */
function groupCompletionDiscovery(table, options = {}) {
  const maxResults = options.maxResults || 15;
  const predictions = [];

  // Build a map of property-combo → set of groups that have it
  // (ignoring the group property itself). Use single-char abbreviations
  // for mass/spin/phase/reactivity to keep keys compact and parseable.
  const comboGroups = new Map();
  for (const el of table.elements) {
    const p = el.properties;
    const c = p.charge > 0 ? '+' : p.charge < 0 ? '-' : '0';
    const m = (p.mass || 'light')[0];
    const s = (p.spin || 'even')[0];
    const ph = (p.phase || 'solid')[0];
    const r = (p.reactivity || 'inert')[0];
    const comboKey = `C${c}V${p.valence}M${m}S${s}P${ph}R${r}`;
    if (!comboGroups.has(comboKey)) comboGroups.set(comboKey, new Set());
    comboGroups.get(comboKey).add(p.group);
  }

  // For each combo that exists in 2+ groups, check which groups are missing
  for (const [comboKey, groups] of comboGroups) {
    if (groups.size < 2) continue;
    for (let g = 1; g <= MAX_GROUP; g++) {
      if (groups.has(g)) continue;
      // This combo exists in other groups but not group g
      // Parse the combo key back to properties
      const m = comboKey.match(/C([+\-0])V(\d)M([lmh])S([eo])P([slg])R([ilmh])/);
      if (!m) continue;
      const props = {
        charge: m[1] === '+' ? 1 : m[1] === '-' ? -1 : 0,
        valence: parseInt(m[2]),
        mass: { l: 'light', m: 'medium', h: 'heavy' }[m[3]],
        spin: { e: 'even', o: 'odd' }[m[4]],
        phase: { s: 'solid', l: 'liquid', g: 'gas' }[m[5]],
        reactivity: { i: 'inert', l: 'low', m: 'medium', h: 'high' }[m[6]],
        electronegativity: 0.5,
        group: g,
        period: 3, // default middle period
      };
      const sig = encodeSignature(props);
      if (table.getElement(sig)) continue;
      predictions.push({
        signature: sig,
        properties: props,
        priority: groups.size / MAX_GROUP, // more groups have it = higher priority
        strategy: 'group',
        description: buildDescription(props),
        generationSpec: buildGenerationSpec(props),
        existsInGroups: Array.from(groups).map(gn => GROUPS[gn] || `group_${gn}`),
      });
    }
  }

  return predictions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxResults);
}

/**
 * Strategy 3: Interaction Prediction Discovery.
 * Find pairs with high interaction coherence whose "compound"
 * (averaged properties) doesn't exist yet.
 */
function interactionPredictionDiscovery(table, options = {}) {
  const maxResults = options.maxResults || 10;
  const predictions = [];
  const elements = table.elements;

  // For efficiency, only check pairs among the top-used elements
  const topElements = elements
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 50);

  for (let i = 0; i < topElements.length; i++) {
    for (let j = i + 1; j < topElements.length; j++) {
      const e1 = topElements[i];
      const e2 = topElements[j];
      const coherence = table.interactionCoherence(e1.signature, e2.signature);
      if (coherence < 0.6) continue; // only high-coherence pairs

      // "Compound" = averaged properties
      const compound = averageProperties(e1.properties, e2.properties);
      const sig = encodeSignature(compound);
      if (table.getElement(sig)) continue;

      predictions.push({
        signature: sig,
        properties: compound,
        priority: coherence,
        strategy: 'interaction',
        description: buildDescription(compound),
        generationSpec: buildGenerationSpec(compound),
        parentElements: [e1.signature, e2.signature],
        interactionCoherence: coherence,
      });
    }
  }

  return predictions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxResults);
}

// ── Helpers ─────────────────────────────────────────────────────────

function averageProperties(p1, p2) {
  const mOrder = { light: 0, medium: 1, heavy: 2 };
  const mReverse = ['light', 'medium', 'heavy'];
  const rOrder = { inert: 0, low: 1, medium: 2, high: 3 };
  const rReverse = ['inert', 'low', 'medium', 'high'];

  return {
    charge: Math.round((p1.charge + p2.charge) / 2),
    valence: Math.round((p1.valence + p2.valence) / 2),
    mass: mReverse[Math.round(((mOrder[p1.mass] || 0) + (mOrder[p2.mass] || 0)) / 2)],
    spin: p1.spin === p2.spin ? p1.spin : 'even',
    phase: p1.phase === p2.phase ? p1.phase : 'liquid',
    reactivity: rReverse[Math.round(((rOrder[p1.reactivity] || 0) + (rOrder[p2.reactivity] || 0)) / 2)],
    electronegativity: Math.round(((p1.electronegativity || 0) + (p2.electronegativity || 0)) / 2 * 100) / 100,
    group: Math.round((p1.group + p2.group) / 2),
    period: Math.round((p1.period + p2.period) / 2),
  };
}

function buildDescription(props) {
  const chargeName = props.charge > 0 ? 'expanding' : props.charge < 0 ? 'contracting' : 'transforming';
  const groupName = GROUPS[props.group] || 'general';
  const massName = props.mass;
  const spinName = props.spin === 'even' ? 'pure/reversible' : 'side-effecting';
  const phaseName = props.phase === 'solid' ? 'cached' : props.phase === 'liquid' ? 'mutable' : 'computed';
  return `A ${massName}-weight ${chargeName} ${groupName} function that is ${spinName}, ${phaseName}, with valence ${props.valence} and ${props.reactivity} reactivity`;
}

function buildGenerationSpec(props) {
  return {
    prompt: buildDescription(props),
    constraints: {
      complexity: props.mass === 'light' ? 'O(1)' : props.mass === 'medium' ? 'O(n)' : 'O(n²)',
      pure: props.spin === 'even',
      composable: props.valence > 0,
      cacheable: props.phase === 'solid',
      maxDependencies: props.valence,
      sideEffects: props.spin === 'odd',
    },
    targetGroup: GROUPS[props.group] || 'general',
    targetPeriod: props.period,
  };
}

module.exports = {
  runDiscovery,
  neighborGapDiscovery,
  groupCompletionDiscovery,
  interactionPredictionDiscovery,
  buildDescription,
  buildGenerationSpec,
};
