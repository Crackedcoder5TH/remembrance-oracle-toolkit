#!/usr/bin/env node
'use strict';

/**
 * oracle-scorer-service.js — long-lived Node HTTP service.
 *
 * Mirror of Void-Data-Compressor/compressor_service.py for the
 * oracle-side scorers. Loads coherency.js + property-extractor.js
 * once at startup; every request reuses the in-process state.
 *
 * Endpoints (all POST except /health):
 *   GET  /health
 *        → {status, uptime_s, version}
 *   POST /text_score              {code, language}
 *        → {total, breakdown}
 *   POST /atomic_score            {code, language}
 *        → {properties (13D), score (0..1)}
 *   POST /score_batch             {records: [{code, language, ...}, ...]}
 *        → {scores: [{text_score, atomic_score, atomic_props}, ...]}
 *   POST /shutdown
 *        → {ok: true}
 *
 * Wire format: JSON in / JSON out.
 *
 * Usage:
 *   node scripts/oracle-scorer-service.js [--host 127.0.0.1] [--port 8766]
 */

const http = require('http');
const { computeCoherencyScore } = require('../src/unified/coherency');
const { extractAtomicProperties } = require('../src/atomic/property-extractor');

const HOST = process.env.ORACLE_SCORER_HOST || process.argv.includes('--host')
  ? (process.argv[process.argv.indexOf('--host') + 1] || '127.0.0.1')
  : '127.0.0.1';
const PORT = process.argv.includes('--port')
  ? Number(process.argv[process.argv.indexOf('--port') + 1] || 8766)
  : Number(process.env.ORACLE_SCORER_PORT || 8766);

const STARTED_AT = Date.now();

// ─── atomic_score: collapse 13 dimensions to a single 0..1 score ──
// 1.0 if all dimensions valid AND none blocking
// 0.0 if any blocking value set
// Fractional otherwise based on how many soft signals are positive

function _atomicToScore(props) {
  if (!props) return 0;
  // Hard rejects per the covenant spec
  if (props.harmPotential === 'dangerous') return 0;
  if (props.alignment === 'degrading') return 0;
  if (props.intention === 'malevolent') return 0;
  if (props.taint === 'tainted') return 0;

  // Soft signals: positive contributions
  let score = 0.5;  // baseline for passing the hard gates
  if (props.alignment === 'healing')      score += 0.2;
  else if (props.alignment === 'neutral') score += 0.1;
  if (props.intention === 'benevolent')   score += 0.1;
  else if (props.intention === 'neutral') score += 0.05;
  if (props.harmPotential === 'none')     score += 0.1;
  if (props.charge === 1)                 score += 0.05; // expansive
  if (props.reactivity === 'inert')       score += 0.05;
  return Math.min(1.0, score);
}

// ─── handlers ─────────────────────────────────────────────────────

const handlers = {
  '/health': (_args) => ({
    status: 'ok',
    uptime_s: Math.round((Date.now() - STARTED_AT) / 1000),
    version: 1,
  }),

  '/text_score': (args) => {
    const code = args.code || '';
    const language = args.language || 'javascript';
    const r = computeCoherencyScore(code, { language });
    return { total: r.total, breakdown: r.breakdown };
  },

  '/atomic_score': (args) => {
    const code = args.code || '';
    const language = args.language || 'javascript';
    const props = extractAtomicProperties(code, { language });
    return { properties: props, score: _atomicToScore(props) };
  },

  '/score_batch': (args) => {
    const records = args.records || [];
    const scores = records.map((r) => {
      const code = r.code || '';
      const language = r.language || 'javascript';
      try {
        const t = computeCoherencyScore(code, { language });
        const props = extractAtomicProperties(code, { language });
        return {
          name: r.name,
          uri: r.uri,
          text_score: t.total,
          atomic_score: _atomicToScore(props),
          atomic_props: props,
        };
      } catch (e) {
        return { name: r.name, uri: r.uri, error: String(e) };
      }
    });
    return { scores, count: scores.length };
  },
};

// ─── HTTP shim ────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const send = (code, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(payload);
  };

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, handlers['/health']({}));
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    send(200, { ok: true });
    setTimeout(() => process.exit(0), 100);
    return;
  }

  if (req.method !== 'POST' || !handlers[req.url]) {
    return send(404, { error: `unknown route ${req.method} ${req.url}` });
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let args = {};
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      args = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return send(400, { error: `bad json: ${e.message}` });
    }
    try {
      send(200, handlers[req.url](args));
    } catch (e) {
      send(500, { error: e.message, route: req.url });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[oracle-scorer-service] listening on http://${HOST}:${PORT}`);
});
