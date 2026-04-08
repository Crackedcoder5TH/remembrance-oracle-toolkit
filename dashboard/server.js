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

server.listen(PORT, () => {
  console.log(`Remembrance Dashboard running at http://localhost:${PORT}`);
  console.log(`  Oracle API: ${ORACLE_URL}`);
  console.log(`  Void API:   ${VOID_URL}`);
});
