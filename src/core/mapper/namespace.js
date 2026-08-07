'use strict';

/**
 * mapper/namespace.js — who is this repo, according to the substrate.
 *
 * The Void substrate indexes repos under short aliases (rmb-blockchain,
 * oracle, claw, …) that rarely match the directory basename — guessing
 * the namespace from the path misclassifies every file as ORPHAN and
 * turns self-matches into fake 1.0000 "cross-system bridges". These two
 * detectors let the substrate answer instead. Extracted from
 * coherency-mapper.js in the flagship decomposition.
 */

const fs = require('node:fs');
const path = require('node:path');
const ft = require('../field-tool');
const { _inferLang } = require('./config');

/**
 * Detect the substrate namespace for a project by resonance
 * self-identification: read a small sample of the project's files
 * against the substrate, find their exact self-matches (cosine ≥
 * selfMatchAt with the same basename), and take the dominant name
 * prefix. The substrate tells us who we are.
 *
 * @param {string[]} files       — absolute file paths from the walk
 * @param {string}   projectPath — project root (for relative names)
 * @param {object}   [opts]
 *   sampleSize?:  number = 8    — how many files to read for detection
 *   selfMatchAt?: number = 0.999 — cosine floor for a self-match
 *   sourceTag?:   string        — field-coupling source for the reads
 * @returns {string|null} the detected namespace, or null when no
 *   prefix reaches two independent self-matches.
 */
function detectSubstrateNamespace(files, projectPath, opts = {}) {
  const sampleSize = opts.sampleSize || 8;
  const selfMatchAt = opts.selfMatchAt || 0.999;
  const sourceTag = opts.sourceTag || 'coherency-map:detect-namespace';
  // Spread the sample across the walk order rather than taking a block,
  // so one directory can't dominate the vote.
  const candidates = files.filter(f => /\.(m?[jt]sx?|c[jt]s|py|rs|go|md)$/.test(f));
  const step = Math.max(1, Math.floor(candidates.length / sampleSize));
  const sample = [];
  for (let i = 0; i < candidates.length && sample.length < sampleSize; i += step) {
    sample.push(candidates[i]);
  }
  const votes = {};
  for (const f of sample) {
    let content;
    try { content = fs.readFileSync(f, 'utf8').slice(0, 12000); } catch { continue; }
    if (content.length < 60) continue;
    const rel = path.relative(projectPath, f);
    let r;
    try {
      r = ft.read(
        { content, name: rel, language: _inferLang(rel) },
        { source: sourceTag, growSubstrate: false, topK: 3 },
      );
    } catch { continue; }
    const matches = (r && r.voidResonance && r.voidResonance.topMatches) || [];
    for (const m of matches) {
      const score = m.d4 !== undefined ? m.d4 : (m.score || 0);
      const name = String(m.name || '');
      if (score >= selfMatchAt && name.includes('/')
          && path.basename(name) === path.basename(rel)) {
        const prefix = name.split('/')[0];
        votes[prefix] = (votes[prefix] || 0) + 1;
      }
    }
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  // Two independent self-matches make a quorum; a single hit could be a
  // genuine cross-repo duplicate (bootstrap scripts, shared docs).
  if (ranked.length && ranked[0][1] >= 2) return ranked[0][0];
  return null;
}
detectSubstrateNamespace.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'liquid',
  reactivity: 'stable', electronegativity: 0.6, group: 15, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'analysis',
};

/**
 * Detect the substrate namespace with zero encoding: one pass over the
 * index names, voting for the prefix whose entries' relative paths
 * coincide with the repo's walked files.
 *
 * @param {string[]} rels — repo-relative file paths
 * @param {Iterable<string>} indexNames — substrate pattern names
 * @returns {string|null}
 */
function namespaceFromIndexNames(rels, indexNames) {
  const relSet = new Set(rels);
  const votes = {};
  for (const name of indexNames) {
    const i = name.indexOf('/');
    if (i <= 0) continue;
    if (relSet.has(name.slice(i + 1))) {
      const prefix = name.slice(0, i);
      votes[prefix] = (votes[prefix] || 0) + 1;
    }
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  // Three coinciding paths make a quorum; one or two could be shared
  // boilerplate (bootstrap scripts, AGENTS.md) living in several repos.
  if (ranked.length && ranked[0][1] >= 3) return ranked[0][0];
  return null;
}
namespaceFromIndexNames.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 12, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'analysis',
};

module.exports = { detectSubstrateNamespace, namespaceFromIndexNames };
