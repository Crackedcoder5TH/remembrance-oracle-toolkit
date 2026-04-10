'use strict';

/**
 * Remembrance Dashboard Server
 *
 * Zero-dependency dashboard that proxies to Oracle + Void APIs
 * and serves the frontend. Runs standalone or inside Docker.
 *
 * Usage:
 *   node server.js
 *   → Dashboard: http://localhost:4000
 *   → Proxies:   Oracle (3000), Void (8080)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DASHBOARD_PORT || '4000', 10);
const ORACLE_URL = process.env.ORACLE_TOOLKIT_URL || 'http://localhost:3000';
const VOID_URL = process.env.VOID_COMPRESSOR_URL || 'http://localhost:8080';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ─── API Proxy Routes ──────────────────────────────────────
  if (url.pathname.startsWith('/api/oracle/')) {
    return proxy(req, res, ORACLE_URL, url.pathname.replace('/api/oracle', ''));
  }
  if (url.pathname.startsWith('/api/void/')) {
    return proxy(req, res, VOID_URL, url.pathname.replace('/api/void', ''));
  }

  // ─── Dashboard API (aggregates both systems) ───────────────
  if (url.pathname === '/api/dashboard/status') {
    return dashboardStatus(req, res);
  }
  if (url.pathname === '/api/dashboard/config') {
    return sendJson(res, {
      oracleUrl: ORACLE_URL,
      voidUrl: VOID_URL,
      dashboardPort: PORT,
    });
  }

  // ─── Auto-Workflow API ─────────────────────────────────────
  // The full search→decide→score→heal→cascade→register pipeline
  // Runs automatically — this is what the website uses
  if (url.pathname === '/api/workflow/run' && req.method === 'POST') {
    return runWorkflow(req, res);
  }
  if (url.pathname === '/api/workflow/score' && req.method === 'POST') {
    return runScore(req, res);
  }
  if (url.pathname === '/api/workflow/search' && req.method === 'POST') {
    return runSearch(req, res);
  }
  if (url.pathname === '/api/workflow/cascade' && req.method === 'POST') {
    return runCascade(req, res);
  }

  // ─── Static Files ──────────────────────────────────────────
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const fullPath = path.join(__dirname, 'public', filePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    // SPA fallback
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

// ─── Proxy helper ────────────────────────────────────────────

function proxy(clientReq, clientRes, targetBase, targetPath) {
  const targetUrl = new URL(targetPath, targetBase);
  const transport = targetUrl.protocol === 'https:' ? require('https') : http;

  let body = '';
  clientReq.on('data', c => body += c);
  clientReq.on('end', () => {
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: clientReq.method,
      headers: { ...clientReq.headers, host: targetUrl.host },
      timeout: 10000,
    };

    const proxyReq = transport.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', () => {
      sendJson(clientRes, { error: 'Service unavailable', target: targetBase }, 502);
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

// ─── Dashboard aggregation ───────────────────────────────────

async function dashboardStatus(req, res) {
  const [oracle, void_] = await Promise.all([
    fetchJson(ORACLE_URL + '/health').catch(() => ({ status: 'offline' })),
    fetchJson(VOID_URL + '/status').catch(() => ({ status: 'offline' })),
  ]);

  sendJson(res, {
    timestamp: new Date().toISOString(),
    oracle: { ...oracle, url: ORACLE_URL },
    void: { ...void_, url: VOID_URL },
    ecosystem: {
      oracleOnline: oracle.status !== 'offline',
      voidOnline: void_.status !== 'offline',
      healthy: oracle.status !== 'offline' && void_.status !== 'offline',
    },
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? require('https') : http;
    const req = transport.get({ hostname: u.hostname, port: u.port, path: u.pathname, timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// ─── Workflow Endpoints ──────────────────────────────────────

/**
 * POST /api/workflow/run — Full auto-workflow on submitted code
 * Body: { code, language, name }
 * Returns: { search, decide, score, heal, cascade, register } — all steps
 */
async function runWorkflow(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJson(res, { error: 'Invalid JSON' }, 400); }

  const { code, language = 'javascript', name = 'unnamed' } = parsed;
  if (!code) return sendJson(res, { error: 'code is required' }, 400);

  const startTime = Date.now();
  const steps = {};

  // Step 1: SEARCH — find existing patterns
  try {
    const searchRes = await fetchJson(ORACLE_URL + '/api/search', {
      method: 'POST',
      body: JSON.stringify({ term: name + ' ' + language, limit: 3 }),
    });
    const matches = searchRes.results || searchRes || [];
    steps.search = {
      matches: matches.length,
      topMatch: matches[0] ? { name: matches[0].name, coherency: matches[0].coherencyScore?.total || matches[0].coherency || 0 } : null,
    };
  } catch { steps.search = { matches: 0, topMatch: null }; }

  // Step 2: DECIDE — PULL/EVOLVE/GENERATE
  const topScore = steps.search.topMatch?.coherency || 0;
  steps.decide = {
    decision: topScore >= 0.68 ? 'PULL' : topScore >= 0.50 ? 'EVOLVE' : 'GENERATE',
    confidence: topScore,
    pattern: steps.search.topMatch?.name || null,
  };

  // Step 3: SCORE — 7-dimension coherency (local scoring)
  const scored = localScore(code);
  steps.score = scored;

  // Step 4: HEAL — if below threshold
  steps.heal = { needed: scored.total < 0.68, performed: false };
  if (scored.total < 0.68) {
    try {
      const healRes = await fetchJson(ORACLE_URL + '/api/reflect', {
        method: 'POST',
        body: JSON.stringify({ code, language, maxIterations: 3 }),
      });
      if (healRes.finalCode || healRes.code) {
        const healedScore = localScore(healRes.finalCode || healRes.code);
        steps.heal = {
          needed: true,
          performed: true,
          before: scored.total,
          after: healedScore.total,
          improvement: Math.round((healedScore.total - scored.total) * 1000) / 1000,
        };
      }
    } catch { steps.heal.performed = false; }
  }

  // Step 5: CASCADE — Void Compressor resonance
  try {
    const cascadeRes = await fetchJson(VOID_URL + '/cascade', {
      method: 'POST',
      body: JSON.stringify({ text: code, name }),
    });
    steps.cascade = {
      coherence: cascadeRes.coherence || 0,
      topMatch: cascadeRes.matches?.[0]?.domain || 'none',
      resonanceCount: (cascadeRes.matches || []).filter(m => Math.abs(m.correlation) >= 0.3).length,
    };
  } catch { steps.cascade = { coherence: 0, topMatch: 'unavailable' }; }

  // Step 6: REGISTER — if quality is high enough
  const finalScore = steps.heal?.after || scored.total;
  steps.register = { eligible: finalScore >= 0.80, registered: false };
  if (finalScore >= 0.80) {
    try {
      await fetchJson(ORACLE_URL + '/api/submit', {
        method: 'POST',
        body: JSON.stringify({ code, language, description: name, tags: [language, 'auto-workflow'] }),
      });
      steps.register.registered = true;
    } catch {}
  }

  sendJson(res, {
    workflow: 'complete',
    steps,
    finalCoherency: finalScore,
    decision: steps.decide.decision,
    durationMs: Date.now() - startTime,
  });
}

/** POST /api/workflow/score — Score code only */
async function runScore(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJson(res, { error: 'Invalid JSON' }, 400); }
  if (!parsed.code) return sendJson(res, { error: 'code is required' }, 400);
  sendJson(res, localScore(parsed.code));
}

/** POST /api/workflow/search — Search patterns */
async function runSearch(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJson(res, { error: 'Invalid JSON' }, 400); }
  try {
    const data = await fetchJson(ORACLE_URL + '/api/search', {
      method: 'POST',
      body: JSON.stringify({ term: parsed.query || parsed.term, limit: parsed.limit || 5 }),
    });
    sendJson(res, data);
  } catch { sendJson(res, { error: 'Oracle unavailable' }, 502); }
}

/** POST /api/workflow/cascade — Cascade resonance */
async function runCascade(req, res) {
  const body = await readBody(req);
  let parsed;
  try { parsed = JSON.parse(body); } catch { return sendJson(res, { error: 'Invalid JSON' }, 400); }
  try {
    const data = await fetchJson(VOID_URL + '/cascade', {
      method: 'POST',
      body: JSON.stringify({ text: parsed.code || parsed.text, name: parsed.name || 'cascade' }),
    });
    sendJson(res, data);
  } catch { sendJson(res, { error: 'Void Compressor unavailable' }, 502); }
}

/** Local coherency scorer (works without Oracle API) */
function localScore(code) {
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  const opens = (code.match(/[{(]/g) || []).length;
  const closes = (code.match(/[})]/g) || []).length;
  const syntax = Math.max(0, 1 - Math.abs(opens - closes) * 0.02);
  const todos = (code.match(/TODO|FIXME|HACK/gi) || []).length;
  const completeness = Math.max(0, 1 - todos * 0.05);
  const comments = nonEmpty.filter(l => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
  const readability = (comments / Math.max(nonEmpty.length, 1)) >= 0.05 ? 1.0 : 0.85;
  let maxD = 0, d = 0;
  for (const ch of code) { if (ch === '{') { d++; maxD = Math.max(maxD, d); } else if (ch === '}') d = Math.max(0, d - 1); }
  const simplicity = Math.max(0, 1 - Math.max(0, maxD - 5) * 0.1);
  let security = 1.0;
  if (/eval\(/.test(code)) security -= 0.2;
  if (/innerHTML/.test(code)) security -= 0.1;
  security = Math.max(0, security);
  const fns = (code.match(/function |def |fn /g) || []).length;
  const testability = fns >= 3 ? 0.9 : 0.7;
  const total = syntax * 0.15 + completeness * 0.15 + readability * 0.15 + simplicity * 0.15 + security * 0.15 + 1.0 * 0.10 + testability * 0.15;
  return {
    total: Math.round(total * 1000) / 1000,
    dimensions: { syntax, completeness, readability, simplicity, security, consistency: 1.0, testability },
    verdict: total >= 0.68 ? 'PULL-READY' : total >= 0.50 ? 'EVOLVE-NEEDED' : 'REGENERATE',
    lines: lines.length,
    nonEmpty: nonEmpty.length,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
  });
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? require('https') : http;
    const method = options.method || 'GET';
    const reqOptions = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      timeout: 8000,
    };
    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

server.listen(PORT, () => {
  console.log(`Remembrance Dashboard running at http://localhost:${PORT}`);
  console.log(`  Oracle API:    ${ORACLE_URL}`);
  console.log(`  Void API:      ${VOID_URL}`);
  console.log(`  Auto-Workflow: POST /api/workflow/run (full pipeline)`);
  console.log(`  Score:         POST /api/workflow/score`);
  console.log(`  Search:        POST /api/workflow/search`);
  console.log(`  Cascade:       POST /api/workflow/cascade`);
});
