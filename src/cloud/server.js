/**
 * Cloud Sync Server — REST API + WebSocket for remote pattern storage.
 *
 * Endpoints:
 *   POST   /api/auth/login       — Authenticate, get JWT token
 *   POST   /api/auth/register    — Create account
 *   GET    /api/patterns          — List patterns (paginated)
 *   POST   /api/patterns          — Upload patterns (batch)
 *   GET    /api/patterns/:id      — Get single pattern
 *   DELETE /api/patterns/:id      — Remove pattern (owner only)
 *   POST   /api/search            — Smart search with intent
 *   GET    /api/stats              — Store statistics
 *   POST   /api/sync/push         — Push local patterns to cloud
 *   POST   /api/sync/pull         — Pull cloud patterns to local
 *   GET    /api/debug/patterns    — List debug patterns
 *   POST   /api/debug/search      — Search debug fixes
 *   WS     /ws                    — Real-time sync channel
 */

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { safeJsonParse } = require('../core/covenant');

// ─── JWT (minimal, no dependencies) ───

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function createToken(payload, secret, expiresIn = 86400) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── Password Hashing (scrypt, no dependencies) ───

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  // Constant-time comparison to prevent timing attacks
  if (check.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

// ─── Cloud Sync Server ───

class CloudSyncServer {
  /**
   * @param {object} options
   *   - oracle: RemembranceOracle instance
   *   - secret: JWT secret (generated if not provided)
   *   - port: HTTP port (default 3579)
   *   - rateLimit: requests per minute per IP (default 120)
   */
  constructor(options = {}) {
    this.oracle = options.oracle;
    this.secret = options.secret || crypto.randomBytes(32).toString('hex');
    this.port = options.port || 3579;
    this.rateLimit = options.rateLimit || 120;
    this.server = null;
    this.wsClients = new Set();
    this._users = new Map(); // In-memory user store (swap for DB in production)
    this._rateLimits = new Map();
    this._started = false;
  }

  /**
   * Start the HTTP + WebSocket server.
   */
  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));
      this.server.on('upgrade', (req, socket, head) => this._handleUpgrade(req, socket, head));
      this.server.listen(this.port, () => {
        this._started = true;
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the server.
   */
  stop() {
    return new Promise((resolve) => {
      for (const ws of this.wsClients) {
        try { ws.close(); } catch { /* ignore */ }
      }
      this.wsClients.clear();
      if (this.server) {
        this.server.close(() => {
          this._started = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ─── HTTP Request Handler ───

  async _handleRequest(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Rate limiting
    const ip = req.socket.remoteAddress || 'unknown';
    if (!this._checkRateLimit(ip)) {
      return this._json(res, 429, { error: 'Too many requests' });
    }

    // Parse URL
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const path = url.pathname;
    const method = req.method;

    try {
      // Auth routes (no token required)
      if (path === '/api/auth/register' && method === 'POST') {
        return await this._handleRegister(req, res);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        return await this._handleLogin(req, res);
      }
      if (path === '/api/health' && method === 'GET') {
        const patterns = this.oracle.patterns ? this.oracle.patterns.getAll().length : 0;
        return this._json(res, 200, {
          status: 'ok',
          version: '1.0.0',
          patterns,
          uptime: process.uptime(),
          wsClients: this.wsClients.size,
        });
      }

      // All other routes require authentication
      const user = this._authenticate(req);
      if (!user) {
        return this._json(res, 401, { error: 'Unauthorized' });
      }

      // Pattern routes
      if (path === '/api/patterns' && method === 'GET') {
        return this._handleListPatterns(req, res, url);
      }
      if (path === '/api/patterns' && method === 'POST') {
        return await this._handleUploadPatterns(req, res, user);
      }
      if (path.startsWith('/api/patterns/') && method === 'GET') {
        const id = path.slice('/api/patterns/'.length);
        return this._handleGetPattern(res, id);
      }
      if (path.startsWith('/api/patterns/') && method === 'DELETE') {
        const id = path.slice('/api/patterns/'.length);
        return this._handleDeletePattern(res, id, user);
      }

      // Search
      if (path === '/api/search' && method === 'POST') {
        return await this._handleSearch(req, res);
      }
      if (path === '/api/search' && method === 'GET') {
        const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
        if (!q) return this._json(res, 200, { results: [] });
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const results = this.oracle.search(q, { limit });
        return this._json(res, 200, { results });
      }

      // Resolve
      if (path === '/api/resolve' && method === 'POST') {
        const body = await this._readBody(req);
        const result = this.oracle.resolve({
          description: body.description,
          language: body.language || 'javascript',
          tags: body.tags || [],
        });
        return this._json(res, 200, result);
      }

      // Feedback
      if (path === '/api/feedback' && method === 'POST') {
        const body = await this._readBody(req);
        if (!body.id) return this._json(res, 400, { error: 'id is required' });
        const result = this.oracle.patternFeedback(body.id, body.success !== false);
        return this._json(res, 200, result);
      }

      // Vote
      if (path === '/api/vote' && method === 'POST') {
        const body = await this._readBody(req);
        if (!body.patternId) return this._json(res, 400, { error: 'patternId is required' });
        const voter = body.voter || user.username || 'anonymous';
        const result = this.oracle.vote(body.patternId, voter, body.vote || 1);
        this._broadcast({ type: 'vote', patternId: body.patternId, vote: body.vote });
        return this._json(res, 200, result);
      }

      // Top voted
      if (path === '/api/top-voted' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        return this._json(res, 200, this.oracle.topVoted(limit));
      }

      // Reputation
      if (path === '/api/reputation' && method === 'GET') {
        const voterId = url.searchParams.get('voter') || url.searchParams.get('id');
        if (voterId) {
          return this._json(res, 200, this.oracle.getVoterReputation(voterId));
        }
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        return this._json(res, 200, this.oracle.topVoters(limit));
      }

      // Context (AI injection)
      if (path === '/api/context' && method === 'GET') {
        const format = url.searchParams.get('format') || 'markdown';
        const limit = parseInt(url.searchParams.get('limit')) || 20;
        const result = this.oracle.generateContext({ format, limit });
        return this._json(res, 200, result);
      }

      // Reflect
      if (path === '/api/reflect' && method === 'POST') {
        const body = await this._readBody(req);
        const { reflectionLoop } = require('../core/reflection');
        const result = reflectionLoop(body.code || '', {
          language: body.language,
          maxLoops: body.maxLoops || 3,
          targetCoherence: body.targetCoherence || 0.9,
        });
        return this._json(res, 200, result);
      }

      // Covenant check
      if (path === '/api/covenant' && method === 'POST') {
        const body = await this._readBody(req);
        const { covenantCheck } = require('../core/covenant');
        const result = covenantCheck(body.code || '', {
          language: body.language || 'javascript',
          description: body.description || '',
          tags: body.tags || [],
        });
        return this._json(res, 200, result);
      }

      // Analytics
      if (path === '/api/analytics' && method === 'GET') {
        try {
          const { generateAnalytics } = require('../core/analytics');
          return this._json(res, 200, generateAnalytics(this.oracle));
        } catch (err) {
          return this._json(res, 500, { error: err.message });
        }
      }

      // Candidates
      if (path === '/api/candidates' && method === 'GET') {
        try {
          return this._json(res, 200, this.oracle.getCandidates());
        } catch {
          return this._json(res, 200, { candidates: [] });
        }
      }

      // Stats
      if (path === '/api/stats' && method === 'GET') {
        return this._handleStats(res);
      }

      // Sync
      if (path === '/api/sync/push' && method === 'POST') {
        return await this._handleSyncPush(req, res, user);
      }
      if (path === '/api/sync/pull' && method === 'POST') {
        return await this._handleSyncPull(req, res, url);
      }

      // Debug
      if (path === '/api/debug/patterns' && method === 'GET') {
        return this._handleDebugPatterns(res, url);
      }
      if (path === '/api/debug/search' && method === 'POST') {
        return await this._handleDebugSearch(req, res);
      }

      this._json(res, 404, { error: 'Not found' });
    } catch (err) {
      this._json(res, 500, { error: err.message });
    }
  }

  // ─── Auth Handlers ───

  async _handleRegister(req, res) {
    const body = await this._readBody(req);
    const { username, password, email } = body;
    if (!username || !password) {
      return this._json(res, 400, { error: 'Username and password required' });
    }
    if (this._users.has(username)) {
      return this._json(res, 409, { error: 'Username already exists' });
    }
    const user = {
      id: crypto.randomUUID(),
      username,
      email: email || '',
      passwordHash: hashPassword(password),
      role: 'contributor',
      createdAt: new Date().toISOString(),
    };
    this._users.set(username, user);
    const token = createToken({ id: user.id, username, role: user.role }, this.secret);
    this._json(res, 201, { token, user: { id: user.id, username, role: user.role } });
  }

  async _handleLogin(req, res) {
    const body = await this._readBody(req);
    const { username, password } = body;
    const user = this._users.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return this._json(res, 401, { error: 'Invalid credentials' });
    }
    const token = createToken({ id: user.id, username, role: user.role }, this.secret);
    this._json(res, 200, { token, user: { id: user.id, username, role: user.role } });
  }

  // ─── Pattern Handlers ───

  _handleListPatterns(req, res, url) {
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const language = url.searchParams.get('language');

    const store = this.oracle.store;
    let entries = store.list ? store.list() : [];

    if (language) {
      entries = entries.filter(e => e.language === language);
    }

    const total = entries.length;
    const results = entries.slice(offset, offset + limit).map(e => ({
      id: e.id,
      name: e.name,
      language: e.language,
      tags: e.tags,
      coherency: e.coherencyScore?.total || e.coherency || 0,
      description: e.description,
      patternType: e.patternType,
    }));

    this._json(res, 200, { results, total, limit, offset });
  }

  async _handleUploadPatterns(req, res, user) {
    const body = await this._readBody(req);
    const patterns = Array.isArray(body) ? body : body.patterns || [body];
    const results = [];

    for (const p of patterns) {
      try {
        const result = this.oracle.submit(p.code, {
          language: p.language,
          name: p.name,
          tags: p.tags || [],
          description: p.description,
          testCode: p.testCode,
        });
        results.push({ name: p.name, stored: result.stored, id: result.id });
      } catch (err) {
        results.push({ name: p.name, stored: false, error: err.message });
      }
    }

    this._json(res, 200, { uploaded: results.filter(r => r.stored).length, results });
  }

  _handleGetPattern(res, id) {
    const entry = this.oracle.inspect(id);
    if (!entry) {
      return this._json(res, 404, { error: 'Pattern not found' });
    }
    this._json(res, 200, entry);
  }

  _handleDeletePattern(res, id, user) {
    // Only admins can delete
    if (user.role !== 'admin') {
      return this._json(res, 403, { error: 'Admin access required' });
    }
    const store = this.oracle.store;
    if (store.remove) {
      store.remove(id);
      this._broadcast({ type: 'pattern_deleted', id });
      this._json(res, 200, { deleted: true, id });
    } else {
      this._json(res, 501, { error: 'Delete not supported by this store' });
    }
  }

  // ─── Search ───

  async _handleSearch(req, res) {
    const body = await this._readBody(req);
    const { query, language, limit, mode } = body;
    if (!query) {
      return this._json(res, 400, { error: 'Query required' });
    }
    const result = this.oracle.smartSearch(query, { language, limit: limit || 10, mode });
    this._json(res, 200, result);
  }

  // ─── Stats ───

  _handleStats(res) {
    const stats = this.oracle.stats();
    const patternStats = this.oracle.patternStats();
    const total = this.oracle.patterns ? this.oracle.patterns.getAll().length : 0;
    const byLanguage = {};
    if (this.oracle.patterns) {
      for (const p of this.oracle.patterns.getAll()) {
        byLanguage[p.language] = (byLanguage[p.language] || 0) + 1;
      }
    }
    this._json(res, 200, {
      version: '1.0.0',
      patterns: total,
      store: stats,
      patternStats,
      byLanguage,
      uptime: process.uptime(),
      wsClients: this.wsClients.size,
    });
  }

  // ─── Sync ───

  async _handleSyncPush(req, res, user) {
    const body = await this._readBody(req);
    const patterns = body.patterns || [];
    let synced = 0;

    for (const p of patterns) {
      try {
        const result = this.oracle.submit(p.code, {
          language: p.language,
          name: p.name,
          tags: p.tags || [],
          description: p.description,
          testCode: p.testCode,
        });
        if (result.stored) synced++;
      } catch { /* skip failed */ }
    }

    this._broadcast({ type: 'sync_push', user: user.username, count: synced });
    this._json(res, 200, { synced, total: patterns.length });
  }

  async _handleSyncPull(req, res, url) {
    const since = url.searchParams.get('since');
    const language = url.searchParams.get('language');
    const limit = parseInt(url.searchParams.get('limit')) || 100;

    const store = this.oracle.store;
    let entries = store.list ? store.list() : [];

    if (language) {
      entries = entries.filter(e => e.language === language);
    }

    const results = entries.slice(0, limit).map(e => ({
      id: e.id,
      name: e.name,
      code: e.code,
      testCode: e.testCode,
      language: e.language,
      tags: e.tags,
      description: e.description,
      coherency: e.coherencyScore?.total || e.coherency || 0,
    }));

    this._json(res, 200, { patterns: results, total: entries.length });
  }

  // ─── Debug ───

  _handleDebugPatterns(res, url) {
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const patterns = this.oracle.debugPatterns({ category, limit });
    this._json(res, 200, { patterns, total: patterns.length });
  }

  async _handleDebugSearch(req, res) {
    const body = await this._readBody(req);
    const { errorMessage, language, limit } = body;
    if (!errorMessage) {
      return this._json(res, 400, { error: 'errorMessage required' });
    }
    const results = this.oracle.debugSearch({ errorMessage, language, limit: limit || 5 });
    this._json(res, 200, { results });
  }

  // ─── WebSocket ───

  _handleUpgrade(req, socket, head) {
    // Verify auth for WebSocket connections
    const url = new URL(req.url, `http://localhost:${this.port}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    const user = token ? verifyToken(token, this.secret) : null;
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // WebSocket handshake
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    // SHA-1 is mandated by RFC 6455 for WebSocket handshake — not a security concern
    const accept = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11AD48')
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '', '',
    ].join('\r\n'));

    const ws = { socket, user, alive: true };
    this.wsClients.add(ws);

    socket.on('data', (data) => this._handleWsMessage(ws, data));
    socket.on('close', () => this.wsClients.delete(ws));
    socket.on('error', () => this.wsClients.delete(ws));

    // Send welcome
    this._wsSend(ws, { type: 'connected', user: user.username });
  }

  _handleWsMessage(ws, data) {
    try {
      // Decode WebSocket frame (simplified — handles small messages)
      const firstByte = data[0];
      const opcode = firstByte & 0x0f;
      if (opcode === 0x08) { // Close
        this.wsClients.delete(ws);
        ws.socket.end();
        return;
      }
      if (opcode === 0x0a || opcode === 0x09) return; // Pong/Ping

      const secondByte = data[1];
      const masked = (secondByte & 0x80) !== 0;
      let length = secondByte & 0x7f;
      let offset = 2;

      if (length === 126) {
        length = data.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        length = Number(data.readBigUInt64BE(2));
        offset = 10;
      }

      let payload;
      if (masked) {
        const mask = data.slice(offset, offset + 4);
        offset += 4;
        payload = Buffer.alloc(length);
        for (let i = 0; i < length; i++) {
          payload[i] = data[offset + i] ^ mask[i % 4];
        }
      } else {
        payload = data.slice(offset, offset + length);
      }

      const msg = safeJsonParse(payload.toString(), null);
      if (!msg) return;

      // Handle sync messages
      if (msg.type === 'sync_request') {
        const stats = this.oracle.stats();
        this._wsSend(ws, { type: 'sync_response', stats });
      } else if (msg.type === 'ping') {
        this._wsSend(ws, { type: 'pong' });
      }
    } catch { /* ignore malformed messages */ }
  }

  _wsSend(ws, data) {
    try {
      const payload = Buffer.from(JSON.stringify(data));
      const frame = Buffer.alloc(2 + (payload.length > 125 ? 2 : 0) + payload.length);
      frame[0] = 0x81; // Text frame, final
      let offset = 1;
      if (payload.length > 125) {
        frame[offset++] = 126;
        frame.writeUInt16BE(payload.length, offset);
        offset += 2;
      } else {
        frame[offset++] = payload.length;
      }
      payload.copy(frame, offset);
      ws.socket.write(frame);
    } catch { /* ignore write errors */ }
  }

  _broadcast(data) {
    for (const ws of this.wsClients) {
      this._wsSend(ws, data);
    }
  }

  // ─── Utilities ───

  _authenticate(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return verifyToken(auth.slice(7), this.secret);
  }

  _checkRateLimit(ip) {
    const now = Date.now();
    const window = 60000; // 1 minute
    let entry = this._rateLimits.get(ip);
    if (!entry || now - entry.start > window) {
      entry = { start: now, count: 0 };
      this._rateLimits.set(ip, entry);
    }
    entry.count++;
    return entry.count <= this.rateLimit;
  }

  async _readBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        resolve(safeJsonParse(body, {}));
      });
    });
  }

  _json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

module.exports = {
  CloudSyncServer,
  createToken,
  verifyToken,
  hashPassword,
  verifyPassword,
};
