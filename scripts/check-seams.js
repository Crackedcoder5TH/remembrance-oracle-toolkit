#!/usr/bin/env node
'use strict';

/**
 * check:seams — the gap-gate.
 *
 * Diffs the wiring contract (seams.json) against the Remembrance field's live
 * per-source histogram. Each declared seam should be CONTRIBUTING to the field;
 * a declared seam with no recent contribution is silent drift — built but not
 * flowing. Reads the live field when REMEMBRANCE_FIELD_URL is set (the shared
 * substrate where every repo's contributions converge), else the local engine.
 *
 *   node scripts/check-seams.js [--json] [--strict] [--max-stale-hours N]
 *
 * Exit: 0 = all declared seams flowing · 1 = a seam is MISSING (or STALE under
 * --strict) · 2 = the field/contract couldn't be read. Wire this into CI/cron so
 * a seam that goes inert turns the build red instead of failing silently.
 */

const fs = require('node:fs');
const path = require('node:path');

const STATE_DIR = process.env.REMEMBRANCE_STATE_DIR || process.env.ORACLE_ROOT || path.join(__dirname, '..');
if (STATE_DIR && !process.env.ENTROPY_PATH) {
  process.env.ENTROPY_PATH = path.join(STATE_DIR, '.remembrance', 'entropy.json');
}

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const STRICT = argv.includes('--strict'); // fail on STALE too (default: fail only on MISSING)
const CONTRIBUTE = argv.includes('--contribute'); // feed the verdict back into the LRE
const staleIdx = argv.indexOf('--max-stale-hours');
const STALE_OVERRIDE = staleIdx >= 0 ? Number(argv[staleIdx + 1]) : null;

function loadContract() {
  const p = path.join(__dirname, '..', 'seams.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Where the seams converge: the live field if configured, else the local engine.
async function readField() {
  const raw = (process.env.REMEMBRANCE_FIELD_URL || '').trim();
  if (raw) {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    url = url.replace(/\/(mcp)?\/?$/i, '');
    const res = await fetch(url + '/field');
    if (!res.ok) throw new Error(`${url}/field -> ${res.status}`);
    const data = await res.json();
    const f = data.field || data;
    return { sources: f.sources || {}, where: url, base: url };
  }
  const { peekField } = require('../src/core/field-coupling');
  const f = peekField() || {};
  return { sources: f.sources || {}, where: 'local:' + (process.env.ENTROPY_PATH || '.remembrance/entropy.json'), base: null };
}

// Complete the meta loop: the act of checking the wiring becomes a contribution
// to the field — the LRE's per-source histogram exists precisely to answer
// "what's wired / what's missing", so feeding it the wiring-coherence makes the
// field aware of its own wiring health. The watcher thereby becomes a watched
// seam (seams:wiring): if check:seams stops running, its own seam goes stale.
async function contributeWiring(base, coherence) {
  const source = 'seams:wiring';
  if (base) {
    const token = (process.env.REMEMBRANCE_FIELD_TOKEN || process.env.FIELD_TOKEN || '').trim();
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    await fetch(base + '/contribute', { method: 'POST', headers, body: JSON.stringify({ coherence, source, cost: 1 }) }).catch(() => {});
  } else {
    try { require('../src/core/field-coupling').contribute({ cost: 1, coherence, source }); } catch (_) { /* engine optional */ }
  }
}

function matchKeys(sources, seam) {
  const keys = Object.keys(sources);
  if (seam.match === 'prefix') return keys.filter((k) => k === seam.source || k.startsWith(seam.source));
  return keys.filter((k) => k === seam.source);
}

(async () => {
  const contract = loadContract();
  const defaultStale = STALE_OVERRIDE != null ? STALE_OVERRIDE : ((contract.defaults && contract.defaults.maxStaleHours) || 168);
  const { sources, where, base } = await readField();
  const now = Date.now();

  const claimed = new Set();
  const rows = [];
  let missing = 0;
  let stale = 0;

  for (const seam of contract.seams) {
    const keys = matchKeys(sources, seam);
    keys.forEach((k) => claimed.add(k));
    const maxStale = STALE_OVERRIDE != null ? STALE_OVERRIDE : (seam.maxStaleHours || defaultStale);

    if (keys.length === 0) {
      rows.push({ id: seam.id, source: seam.source, status: 'MISSING', count: 0, ageHours: null, detail: 'never contributed' });
      missing++;
      continue;
    }
    let count = 0;
    let last = 0;
    for (const k of keys) {
      const s = sources[k] || {};
      count += Number(s.count) || 0;
      last = Math.max(last, Number(s.lastTimestamp) || 0);
    }
    const ageHours = last ? (now - last) / 3600000 : Infinity;
    if (ageHours > maxStale) {
      rows.push({ id: seam.id, source: seam.source, status: 'STALE', count, ageHours, detail: `last ${ageHours.toFixed(1)}h ago (> ${maxStale}h)` });
      stale++;
    } else {
      rows.push({ id: seam.id, source: seam.source, status: 'FLOWING', count, ageHours, detail: `${count} contributions, last ${ageHours.toFixed(1)}h ago` });
    }
  }

  // Field sources nobody declared (excluding the field's own auto-instrumentation),
  // so newly-wired seams surface for declaration instead of hiding.
  const auto = /^(op:|entangle:|storage:|field-server:)/;
  const untracked = Object.keys(sources).filter((k) => !claimed.has(k) && !auto.test(k));

  const fail = missing > 0 || (STRICT && stale > 0);

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: !fail, where, flowing: rows.filter((r) => r.status === 'FLOWING').length, stale, missing, seams: rows, untracked }, null, 2));
  } else {
    console.log(`seams · field: ${where}`);
    for (const r of rows) {
      const mark = r.status === 'FLOWING' ? '✓' : r.status === 'STALE' ? '~' : '✗';
      console.log(`  ${mark} ${r.id.padEnd(16)} ${r.status.padEnd(8)} ${r.source}  — ${r.detail}`);
    }
    if (untracked.length) console.log(`  untracked (declare in seams.json or ignore): ${untracked.join(', ')}`);
    const flowing = rows.filter((r) => r.status === 'FLOWING').length;
    console.log(`\n${fail ? 'FAIL' : 'OK'} — ${flowing} flowing, ${stale} stale, ${missing} missing`);
  }

  // Awareness: contribute the wiring-coherence (fraction of declared seams
  // flowing) back into the LRE, so the field knows how wired it is — and so the
  // watcher itself shows up as the seams:wiring seam.
  if (CONTRIBUTE) {
    const flowing = rows.filter((r) => r.status === 'FLOWING').length;
    const wiring = rows.length ? flowing / rows.length : 0;
    await contributeWiring(base, wiring);
    if (!JSON_OUT) console.log(`— contributed wiring coherence ${wiring.toFixed(3)} to the field (source seams:wiring)`);
  }

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('check:seams: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
