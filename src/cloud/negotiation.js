/**
 * Inter-Oracle Negotiation Protocol — The Missing Tongue
 *
 * Enables peer-to-peer pattern negotiation between oracle instances.
 * Oracle A asks Oracle B: "I have merge-sort at 0.93 coherency. Do you have better?"
 * Oracle B responds with its 0.97 variant. They negotiate, compare, and converge.
 *
 * Protocol:
 *   1. ANNOUNCE — Share pattern manifests (id, name, coherency, version)
 *   2. COMPARE  — Identify overlapping patterns with different coherency scores
 *   3. REQUEST  — Ask for superior patterns from the peer
 *   4. OFFER    — Send requested patterns with full code + tests
 *   5. ACCEPT   — Integrate offered patterns (covenant check + coherency gate)
 *   6. CONVERGE — Both oracles update to best-known versions
 */

const http = require('http');

/**
 * Generate a compact manifest of all patterns for negotiation.
 * Only sends metadata — no code until explicitly requested.
 */
function generateManifest(oracle) {
  const patterns = oracle.patterns ? oracle.patterns.getAll() : [];

  // Include temporal health in manifest for richer negotiation
  let temporal = null;
  try { temporal = oracle.getTemporalMemory?.(); } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[negotiation:generateManifest] unavailable:', e?.message || e);
  }

  return patterns.map(p => {
    let health = null;
    if (temporal) {
      try {
        const h = temporal.analyzeHealth(p.id);
        health = { status: h.status, successRate: h.successRate };
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[negotiation:generateManifest] skip:', e?.message || e);
      }
    }
    return {
      id: p.id,
      name: p.name,
      language: p.language,
      coherency: p.coherencyScore?.total ?? 0,
      tags: p.tags || [],
      usageCount: p.usageCount || 0,
      hasTests: !!p.testCode,
      codeHash: _quickHash(p.code || ''),
      health,
    };
  });
}

/**
 * Compare two manifests and identify negotiation opportunities.
 * Returns patterns where the peer has a better version.
 */
function compareManifests(local, remote) {
  const localByName = new Map(local.map(p => [p.name, p]));
  const remoteByName = new Map(remote.map(p => [p.name, p]));

  const opportunities = {
    // Peer has higher coherency for same pattern
    peerSuperior: [],
    // We have higher coherency — we can teach
    localSuperior: [],
    // Peer has patterns we don't have at all
    peerUnique: [],
    // We have patterns peer doesn't have
    localUnique: [],
  };

  for (const [name, remote] of remoteByName) {
    const local = localByName.get(name);
    if (!local) {
      opportunities.peerUnique.push(remote);
    } else if (remote.coherency > local.coherency + 0.02) {
      opportunities.peerSuperior.push({ local, remote, delta: remote.coherency - local.coherency });
    } else if (local.coherency > remote.coherency + 0.02) {
      opportunities.localSuperior.push({ local, remote, delta: local.coherency - remote.coherency });
    }
  }

  for (const [name] of localByName) {
    if (!remoteByName.has(name)) {
      opportunities.localUnique.push(localByName.get(name));
    }
  }

  return opportunities;
}

/**
 * Negotiate with a remote oracle instance.
 * Performs the full 6-step protocol.
 *
 * @param {object} oracle — Local RemembranceOracle instance
 * @param {string} remoteUrl — Base URL of the remote oracle (e.g. http://localhost:3579)
 * @param {string} token — JWT auth token for the remote
 * @param {object} options — { pullSuperior, pushSuperior, pullUnique, pushUnique, minCoherency }
 * @returns {Promise<object>} Negotiation result
 */
async function negotiate(oracle, remoteUrl, token, options = {}) {
  const {
    pullSuperior = true,
    pushSuperior = true,
    pullUnique = true,
    pushUnique = false,
    minCoherency = 0.7,
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    remoteUrl,
    steps: [],
    pulled: 0,
    pushed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Step 1: ANNOUNCE — get remote manifest
    const localManifest = generateManifest(oracle);
    result.steps.push({ step: 'ANNOUNCE', localPatterns: localManifest.length });

    const remoteManifest = await _fetchJson(`${remoteUrl}/api/negotiate/manifest`, {
      method: 'POST',
      token,
      body: { manifest: localManifest },
    });

    if (!remoteManifest || !Array.isArray(remoteManifest.manifest)) {
      result.errors.push('Remote did not return a valid manifest');
      return result;
    }
    result.steps.push({ step: 'ANNOUNCE_RESPONSE', remotePatterns: remoteManifest.manifest.length });

    // Step 2: COMPARE — find opportunities
    const opportunities = compareManifests(localManifest, remoteManifest.manifest);
    result.steps.push({
      step: 'COMPARE',
      peerSuperior: opportunities.peerSuperior.length,
      localSuperior: opportunities.localSuperior.length,
      peerUnique: opportunities.peerUnique.length,
      localUnique: opportunities.localUnique.length,
    });

    // Use coverage map to prioritize blind spots when pulling unique patterns
    let blindSpotDomains = new Set();
    try {
      const coverage = oracle.coverageMap?.() || null;
      if (coverage?.blindSpots) {
        for (const spot of coverage.blindSpots) {
          blindSpotDomains.add(spot.domain);
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[negotiation:init] coverage map unavailable:', e?.message || e);
    }

    // Step 3: REQUEST — ask for superior patterns
    if (pullSuperior && opportunities.peerSuperior.length > 0) {
      const requestIds = opportunities.peerSuperior
        .filter(o => o.remote.coherency >= minCoherency)
        .map(o => o.remote.id);

      if (requestIds.length > 0) {
        const offered = await _fetchJson(`${remoteUrl}/api/negotiate/request`, {
          method: 'POST',
          token,
          body: { patternIds: requestIds },
        });

        // Step 5: ACCEPT — integrate with covenant check
        if (offered && Array.isArray(offered.patterns)) {
          for (const p of offered.patterns) {
            try {
              const submitResult = oracle.submit(p.code, {
                language: p.language,
                name: p.name,
                tags: p.tags || [],
                description: p.description,
                testCode: p.testCode,
              });
              if (submitResult.stored) result.pulled++;
              else result.skipped++;
            } catch (e) {
              if (process.env.ORACLE_DEBUG) console.warn('[negotiation:init] silent failure:', e?.message || e);
              result.skipped++;
            }
          }
        }
      }
      result.steps.push({ step: 'PULL_SUPERIOR', pulled: result.pulled });
    }

    // Pull unique patterns from peer — prioritize blind spot domains
    if (pullUnique && opportunities.peerUnique.length > 0) {
      const sorted = [...opportunities.peerUnique]
        .filter(p => p.coherency >= minCoherency && p.hasTests)
        .sort((a, b) => {
          // Boost patterns whose tags match our blind spots
          const aInBlindSpot = (a.tags || []).some(t => blindSpotDomains.has(t)) ? 1 : 0;
          const bInBlindSpot = (b.tags || []).some(t => blindSpotDomains.has(t)) ? 1 : 0;
          if (aInBlindSpot !== bInBlindSpot) return bInBlindSpot - aInBlindSpot;
          return b.coherency - a.coherency;
        });
      const requestIds = sorted.map(p => p.id);

      if (requestIds.length > 0) {
        const offered = await _fetchJson(`${remoteUrl}/api/negotiate/request`, {
          method: 'POST',
          token,
          body: { patternIds: requestIds },
        });

        if (offered && Array.isArray(offered.patterns)) {
          for (const p of offered.patterns) {
            try {
              const submitResult = oracle.submit(p.code, {
                language: p.language,
                name: p.name,
                tags: p.tags || [],
                description: p.description,
                testCode: p.testCode,
              });
              if (submitResult.stored) result.pulled++;
              else result.skipped++;
            } catch (e) {
              if (process.env.ORACLE_DEBUG) console.warn('[negotiation:bInBlindSpot] silent failure:', e?.message || e);
              result.skipped++;
            }
          }
        }
      }
      result.steps.push({ step: 'PULL_UNIQUE', pulled: result.pulled });
    }

    // Step 4: OFFER — push our superior patterns
    if (pushSuperior && opportunities.localSuperior.length > 0) {
      const pushPatterns = opportunities.localSuperior
        .filter(o => o.local.coherency >= minCoherency)
        .map(o => {
          const full = oracle.patterns.get(o.local.id);
          return full ? {
            code: full.code,
            testCode: full.testCode,
            language: full.language,
            name: full.name,
            tags: full.tags,
            description: full.description,
          } : null;
        })
        .filter(Boolean);

      if (pushPatterns.length > 0) {
        const pushResult = await _fetchJson(`${remoteUrl}/api/patterns`, {
          method: 'POST',
          token,
          body: { patterns: pushPatterns },
        });
        result.pushed = pushResult?.uploaded || 0;
      }
      result.steps.push({ step: 'PUSH_SUPERIOR', pushed: result.pushed });
    }

    // Step 6: CONVERGE
    result.steps.push({
      step: 'CONVERGE',
      summary: `Pulled ${result.pulled}, pushed ${result.pushed}, skipped ${result.skipped}`,
    });

  } catch (err) {
    result.errors.push(err.message);
  }

  return result;
}

/**
 * Add negotiation endpoints to the CloudSyncServer.
 * Call this after creating the server to enable peer negotiation.
 */
function addNegotiationEndpoints(server) {
  const origHandler = server._handleRequest.bind(server);

  server._handleRequest = async function(req, res) {
    const url = new (require('url').URL)(req.url, `http://localhost:${server.port}`);
    const pathStr = url.pathname;

    // Negotiate: manifest exchange
    if (pathStr === '/api/negotiate/manifest' && req.method === 'POST') {
      const user = server._authenticate(req);
      if (!user) return server._json(res, 401, { error: 'Unauthorized' });

      const body = await server._readBody(req);
      const localManifest = generateManifest(server.oracle);
      return server._json(res, 200, { manifest: localManifest });
    }

    // Negotiate: pattern request
    if (pathStr === '/api/negotiate/request' && req.method === 'POST') {
      const user = server._authenticate(req);
      if (!user) return server._json(res, 401, { error: 'Unauthorized' });

      const body = await server._readBody(req);
      const ids = body.patternIds || [];
      const patterns = [];
      for (const id of ids.slice(0, 50)) { // Max 50 per request
        const p = server.oracle.patterns ? server.oracle.patterns.get(id) : null;
        if (p) {
          patterns.push({
            id: p.id,
            name: p.name,
            code: p.code,
            testCode: p.testCode,
            language: p.language,
            tags: p.tags,
            description: p.description,
            coherency: p.coherencyScore?.total ?? 0,
          });
        }
      }
      return server._json(res, 200, { patterns });
    }

    // Fall through to original handler
    return origHandler(req, res);
  };
}

// ─── Helpers ───

function _quickHash(str) {
  if (!str) return '0';
  // Use crypto hash for collision resistance (Meta-Pattern 14 fix)
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function _fetchJson(url, options = {}) {
  return new Promise((resolve) => {
    const urlObj = new (require('url').URL)(url);
    const body = options.body ? JSON.stringify(options.body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers,
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[negotiation:_fetchJson] resolving null on error:', e?.message || e);
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── Multi-Remote Conflict Resolution ───

/**
 * Conflict resolution strategies for 3+ simultaneous remotes.
 */
const CONFLICT_STRATEGIES = {
  HIGHEST_COHERENCY: 'highest-coherency',
  MOST_TESTED: 'most-tested',
  MOST_USED: 'most-used',
  NEWEST: 'newest',
};

/**
 * Resolve conflicts when the same pattern exists on multiple remotes.
 * Picks the winner based on the chosen strategy.
 *
 * @param {Array} candidates — Array of { remote, pattern } for the same name
 * @param {string} strategy — Resolution strategy (default: highest-coherency)
 * @returns {object} Winner { remote, pattern, reason }
 */
function resolveConflict(candidates, strategy = CONFLICT_STRATEGIES.HIGHEST_COHERENCY) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { ...candidates[0], reason: 'only-candidate' };

  // Copy before sorting — never mutate the caller's array (Meta-Pattern 6 fix)
  const sorted = [...candidates];
  switch (strategy) {
    case CONFLICT_STRATEGIES.MOST_TESTED:
      sorted.sort((a, b) => (b.pattern.hasTests ? 1 : 0) - (a.pattern.hasTests ? 1 : 0)
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    case CONFLICT_STRATEGIES.MOST_USED:
      sorted.sort((a, b) => (b.pattern.usageCount || 0) - (a.pattern.usageCount || 0)
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    case CONFLICT_STRATEGIES.NEWEST:
      sorted.sort((a, b) => (b.pattern.codeHash || '').localeCompare(a.pattern.codeHash || '')
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    default: // HIGHEST_COHERENCY
      sorted.sort((a, b) => (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
  }

  return { remote: sorted[0].remote, pattern: sorted[0].pattern, reason: strategy };
}

/**
 * Negotiate simultaneously with multiple remote oracles.
 * Resolves conflicts when the same pattern name exists on 3+ remotes.
 *
 * @param {object} oracle — Local RemembranceOracle instance
 * @param {Array} remotes — Array of { url, token, name }
 * @param {object} options — { strategy, pullUnique, pullSuperior, minCoherency }
 * @returns {Promise<object>} Multi-negotiation result
 */
async function negotiateMulti(oracle, remotes, options = {}) {
  const {
    strategy = CONFLICT_STRATEGIES.HIGHEST_COHERENCY,
    pullSuperior = true,
    pullUnique = true,
    minCoherency = 0.7,
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    remotes: remotes.map(r => r.name || r.url),
    strategy,
    manifests: {},
    conflicts: [],
    resolved: [],
    pulled: 0,
    skipped: 0,
    errors: [],
  };

  // Step 1: Gather manifests from all remotes in parallel
  const localManifest = generateManifest(oracle);
  const manifestPromises = remotes.map(async (remote) => {
    try {
      const response = await _fetchJson(`${remote.url}/api/negotiate/manifest`, {
        method: 'POST',
        token: remote.token,
        body: { manifest: localManifest },
      });
      return { remote: remote.name || remote.url, manifest: response?.manifest || [] };
    } catch (err) {
      result.errors.push(`${remote.name || remote.url}: ${err.message}`);
      return { remote: remote.name || remote.url, manifest: [] };
    }
  });

  const manifestResults = await Promise.all(manifestPromises);
  for (const m of manifestResults) {
    result.manifests[m.remote] = m.manifest.length;
  }

  // Step 2: Build a unified view — group by pattern name across all remotes
  const byName = new Map(); // name → [{ remote, pattern }]
  for (const { remote, manifest } of manifestResults) {
    for (const pattern of manifest) {
      const key = pattern.name;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ remote, pattern });
    }
  }

  // Step 3: Identify conflicts (same name on 2+ remotes)
  const localByName = new Map(localManifest.map(p => [p.name, p]));
  const toPull = []; // { remote, patternId }

  for (const [name, candidates] of byName) {
    const localPattern = localByName.get(name);

    if (candidates.length > 1) {
      // Conflict: multiple remotes have this pattern
      const winner = resolveConflict(candidates, strategy);
      result.conflicts.push({
        name,
        candidates: candidates.map(c => ({ remote: c.remote, coherency: c.pattern.coherency })),
        winner: { remote: winner.remote, coherency: winner.pattern.coherency, reason: winner.reason },
      });

      // Pull winner if it's better than local
      if (pullSuperior && localPattern) {
        if (winner.pattern.coherency > localPattern.coherency + 0.02 && winner.pattern.coherency >= minCoherency) {
          toPull.push({ remote: winner.remote, patternId: winner.pattern.id });
          result.resolved.push({ name, action: 'upgrade', from: winner.remote });
        }
      } else if (pullUnique && !localPattern && winner.pattern.coherency >= minCoherency) {
        toPull.push({ remote: winner.remote, patternId: winner.pattern.id });
        result.resolved.push({ name, action: 'pull-unique', from: winner.remote });
      }
    } else if (candidates.length === 1) {
      // No conflict — single remote has this pattern
      const c = candidates[0];
      if (pullSuperior && localPattern && c.pattern.coherency > localPattern.coherency + 0.02 && c.pattern.coherency >= minCoherency) {
        toPull.push({ remote: c.remote, patternId: c.pattern.id });
      } else if (pullUnique && !localPattern && c.pattern.coherency >= minCoherency && c.pattern.hasTests) {
        toPull.push({ remote: c.remote, patternId: c.pattern.id });
      }
    }
  }

  // Step 4: Pull resolved patterns from the winning remotes
  const pullByRemote = new Map(); // remote → [patternId]
  for (const { remote, patternId } of toPull) {
    if (!pullByRemote.has(remote)) pullByRemote.set(remote, []);
    pullByRemote.get(remote).push(patternId);
  }

  for (const [remoteName, patternIds] of pullByRemote) {
    const remote = remotes.find(r => (r.name || r.url) === remoteName);
    if (!remote) continue;

    try {
      const offered = await _fetchJson(`${remote.url}/api/negotiate/request`, {
        method: 'POST',
        token: remote.token,
        body: { patternIds },
      });

      if (offered && Array.isArray(offered.patterns)) {
        for (const p of offered.patterns) {
          try {
            const submitResult = oracle.submit(p.code, {
              language: p.language,
              name: p.name,
              tags: p.tags || [],
              description: p.description,
              testCode: p.testCode,
            });
            if (submitResult.stored) result.pulled++;
            else result.skipped++;
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[negotiation:init] silent failure:', e?.message || e);
            result.skipped++;
          }
        }
      }
    } catch (err) {
      result.errors.push(`Pull from ${remoteName}: ${err.message}`);
    }
  }

  return result;
}

module.exports = {
  negotiate,
  negotiateMulti,
  generateManifest,
  compareManifests,
  resolveConflict,
  addNegotiationEndpoints,
  CONFLICT_STRATEGIES,
};
