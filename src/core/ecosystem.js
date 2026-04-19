'use strict';

/**
 * Ecosystem discovery + runtime registry.
 *
 * Every module in the Remembrance ecosystem (Oracle Toolkit, Void
 * Compressor, Reflector, Swarm, Dialer, API Key Plugger) ships a
 * `remembrance.json` manifest at its repo root. This module walks
 * the filesystem to find those manifests, reads them, pings the
 * declared health checks, and maintains a live registry of which
 * peers are currently reachable.
 *
 * Three layers of discovery, each catching what the one above missed:
 *
 *   Layer 1 — STATIC MANIFESTS (filesystem)
 *     Walks candidate directories for `remembrance.json` files.
 *     Always available, even before anything is running.
 *
 *   Layer 2 — RUNTIME REGISTRY (shared storage)
 *     Each module writes `.remembrance/modules/<name>.json` (and a
 *     user-scope copy at `~/.remembrance/modules/<name>.json`) at
 *     startup with its live PID, port, and startedAt. Other modules
 *     read this directory to find peers that are alive right now.
 *
 *   Layer 3 — EVENT BUS (reactive auto-wiring)
 *     When a peer appears or disappears, discovery emits
 *     `ecosystem.peer.found` / `ecosystem.peer.lost`. Subsystems
 *     that care about specific peers subscribe and flip behaviors
 *     automatically.
 *
 * Usage:
 *
 *   const eco = require('./core/ecosystem');
 *   const { modules, alive, byCapability } = await eco.discoverEcosystem();
 *   for (const mod of alive) console.log(mod.name, mod.live.port);
 *   const substrates = byCapability('waveform-substrate');
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { getStorage } = require('./storage');
const { getEventBus } = require('./events');

const MANIFEST_FILE = 'remembrance.json';
const USER_DIR = path.join(os.homedir(), '.remembrance', 'modules');
const REPO_DIR = '.remembrance/modules';

// ─── Layer 1: Static manifest discovery ────────────────────────────────────

/**
 * Walk the filesystem looking for `remembrance.json` manifests.
 *
 * Candidate roots searched, in order:
 *   1. explicit options.roots
 *   2. ORACLE_ECOSYSTEM_ROOTS env var (colon-separated)
 *   3. cwd's parent directory (find sibling repos — the common case
 *      when all ecosystem modules are cloned next to each other)
 *   4. $HOME (looks one level deep for repos named after ecosystem
 *      modules)
 *
 * Returns an array of parsed manifests, each augmented with its
 * `repoRoot` (absolute path to the containing directory).
 */
function discoverStatic(options = {}) {
  const searched = new Set();
  const found = [];
  const seenNames = new Set();

  const roots = [];
  if (Array.isArray(options.roots)) roots.push(...options.roots);
  if (process.env.ORACLE_ECOSYSTEM_ROOTS) {
    roots.push(...process.env.ORACLE_ECOSYSTEM_ROOTS.split(path.delimiter).filter(Boolean));
  }
  roots.push(path.dirname(process.cwd()));
  roots.push(os.homedir());

  for (const root of roots) {
    if (!root || searched.has(root)) continue;
    searched.add(root);
    if (!fs.existsSync(root)) continue;

    // First: check the root itself
    tryManifest(root);

    // Second: one level down (siblings of the current repo)
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      tryManifest(path.join(root, entry.name));
    }
  }

  function tryManifest(dir) {
    const p = path.join(dir, MANIFEST_FILE);
    if (!fs.existsSync(p)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (!raw.name) return;
      if (seenNames.has(raw.name)) return;
      seenNames.add(raw.name);
      raw.repoRoot = dir;
      raw._manifestPath = p;
      raw._manifestHash = crypto.createHash('sha1').update(raw.name + dir).digest('hex').slice(0, 12);
      found.push(raw);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[ecosystem]', p, e.message);
    }
  }

  return found;
}

// ─── Layer 2: Runtime registry ─────────────────────────────────────────────

/**
 * Announce this module's live state to the runtime registry.
 *
 * Writes a record to both:
 *   - {repoRoot}/.remembrance/modules/<name>.json  (local, per-repo)
 *   - ~/.remembrance/modules/<name>.json           (global, per-user)
 *
 * The global copy is what lets the Reflector find the Oracle even
 * when they're cloned to different parent directories.
 *
 * Also emits the `ecosystem.module.announced` event so listeners
 * can react (mostly for tests and for the Reflector's CI integration).
 */
function announceModule(repoRoot, options = {}) {
  const manifestPath = path.join(repoRoot, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); }
  catch { return null; }

  const record = {
    name: manifest.name,
    version: manifest.version,
    role: manifest.role,
    repoRoot,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    port: options.port || manifest.api?.port || null,
    host: options.host || manifest.api?.host || 'localhost',
    capabilities: manifest.capabilities || [],
    entrypoints: manifest.entrypoints || {},
  };

  // Local: under the repo's own .remembrance dir
  try {
    const localDir = path.join(repoRoot, REPO_DIR);
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, manifest.name + '.json'),
      JSON.stringify(record, null, 2));
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[ecosystem:announce:local]', e.message);
  }

  // Global: under ~/.remembrance/modules/
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(path.join(USER_DIR, manifest.name + '.json'),
      JSON.stringify(record, null, 2));
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[ecosystem:announce:global]', e.message);
  }

  try {
    getEventBus().emitSync('ecosystem.module.announced', record);
  } catch { /* ignore */ }

  return record;
}

/**
 * Read the runtime registry to find modules that are currently
 * announced. Returns records from the global ~/.remembrance/modules/
 * directory, plus any local `.remembrance/modules/` in the cwd.
 *
 * Stale records (pid no longer running, or startedAt > 24h ago with
 * no health check passing) are NOT filtered out here — they're
 * returned with a `stale: true` flag so the caller can decide.
 */
function readRegistry(repoRoot) {
  const out = new Map();

  // Global first
  if (fs.existsSync(USER_DIR)) {
    for (const f of fs.readdirSync(USER_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(USER_DIR, f), 'utf-8'));
        record._source = 'global';
        record.stale = isStale(record);
        out.set(record.name, record);
      } catch { /* skip */ }
    }
  }

  // Local (per-repo) overrides global
  if (repoRoot) {
    const localDir = path.join(repoRoot, REPO_DIR);
    if (fs.existsSync(localDir)) {
      for (const f of fs.readdirSync(localDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const record = JSON.parse(fs.readFileSync(path.join(localDir, f), 'utf-8'));
          record._source = 'local';
          record.stale = isStale(record);
          out.set(record.name, record);
        } catch { /* skip */ }
      }
    }
  }

  return Array.from(out.values());
}

function isStale(record) {
  if (!record.startedAt) return true;
  const age = Date.now() - new Date(record.startedAt).getTime();
  // 24h cutoff — older records are treated as stale
  return age > 24 * 60 * 60 * 1000;
}

// ─── Health checks ─────────────────────────────────────────────────────────

/**
 * Run the declared health check for a manifest + live record.
 * Returns { alive: bool, latencyMs, error? }.
 *
 * For API-based modules (those with an `api.port` in their manifest),
 * we prefer an HTTP HEAD/GET on the healthPath. For CLI-only modules
 * we shell out to the `healthCheck.command` with a timeout.
 */
function runHealthCheck(manifest, record) {
  const started = Date.now();

  // HTTP health check
  if (manifest.api?.port && manifest.api?.healthPath) {
    const host = record?.host || manifest.api.host || 'localhost';
    const port = record?.port || manifest.api.port;
    const pathStr = manifest.api.healthPath;
    try {
      const http = require('http');
      return new Promise((resolve) => {
        const req = http.get({ host, port, path: pathStr, timeout: 2000 }, (res) => {
          const ok = res.statusCode && res.statusCode < 500;
          resolve({ alive: !!ok, latencyMs: Date.now() - started, statusCode: res.statusCode });
          res.resume();
        });
        req.on('error', (e) => resolve({ alive: false, latencyMs: Date.now() - started, error: e.code || e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ alive: false, latencyMs: Date.now() - started, error: 'timeout' }); });
      });
    } catch (e) {
      return Promise.resolve({ alive: false, error: e.message });
    }
  }

  // CLI health check — shell out, cap at timeout
  const check = manifest.healthCheck;
  if (!check || !check.command) {
    return Promise.resolve({ alive: false, error: 'no health check declared' });
  }
  try {
    execFileSync('sh', ['-c', check.command], {
      cwd: manifest.repoRoot,
      stdio: 'ignore',
      timeout: check.timeoutMs || 5000,
    });
    return Promise.resolve({ alive: true, latencyMs: Date.now() - started });
  } catch (e) {
    return Promise.resolve({ alive: false, latencyMs: Date.now() - started, error: e.code || e.message });
  }
}

// ─── Main discovery entry point ────────────────────────────────────────────

/**
 * Top-level discovery. Merges static + runtime + health into a
 * unified view of the ecosystem.
 *
 * @param {object} [options]
 *   - repoRoot:     override the cwd for local registry lookup
 *   - checkHealth:  run health checks (default true)
 *   - emit:         fire bus events (default true)
 * @returns {{
 *   modules:       Manifest[],
 *   alive:         Manifest[],
 *   stale:         Manifest[],
 *   byName:        (name) => Manifest|null,
 *   byCapability:  (cap) => Manifest[],
 * }}
 */
async function discoverEcosystem(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const checkHealth = options.checkHealth !== false;
  const emit = options.emit !== false;

  // Layer 1: static manifests
  const manifests = discoverStatic(options);

  // Layer 2: runtime registry — merge live state into manifests
  const registry = readRegistry(repoRoot);
  const liveByName = new Map();
  for (const r of registry) liveByName.set(r.name, r);
  for (const m of manifests) {
    const live = liveByName.get(m.name);
    if (live) m.live = live;
  }

  // Layer 3: health checks
  if (checkHealth) {
    const checks = await Promise.all(manifests.map(async (m) => ({
      manifest: m,
      health: await runHealthCheck(m, m.live),
    })));
    for (const { manifest, health } of checks) {
      manifest.health = health;
    }
  }

  const alive = manifests.filter(m => m.health?.alive);
  const stale = manifests.filter(m => m.live && m.live.stale);

  // Fire events for each alive peer that wasn't already known.
  if (emit) {
    const bus = getEventBus();
    const storage = getStorage(repoRoot);
    const ns = storage.namespace('modules');
    const known = new Set(ns.get('known_alive', []) || []);
    const nowAlive = new Set(alive.map(m => m.name));
    for (const name of nowAlive) {
      if (!known.has(name)) {
        const mod = alive.find(m => m.name === name);
        bus.emitSync('ecosystem.peer.found', { name, role: mod.role, capabilities: mod.capabilities, live: mod.live });
      }
    }
    for (const name of known) {
      if (!nowAlive.has(name)) {
        bus.emitSync('ecosystem.peer.lost', { name });
      }
    }
    ns.set('known_alive', [...nowAlive]);
  }

  return {
    modules: manifests,
    alive,
    stale,
    byName: (name) => manifests.find(m => m.name === name) || null,
    byCapability: (cap) => manifests.filter(m => (m.capabilities || []).includes(cap)),
  };
}

// ─── Ecosystem-wide auto-wiring ────────────────────────────────────────────

/**
 * Walk each discovered peer and load its declared autoWire module
 * (from the current module's manifest.peers entries). Each autoWire
 * file exports a `wire(peer, opts)` function that installs the
 * specific subscribers / HTTP proxies for that peer.
 *
 * Safe to call multiple times — each binding is responsible for its
 * own idempotency.
 */
async function autoWireAll(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const selfManifest = loadSelfManifest(repoRoot);
  if (!selfManifest) return { wired: [] };

  // Forward the caller's explicit roots so test fixtures and isolated
  // environments can find peers without relying on cwd + $HOME.
  //
  // Health checks default to ON (so explicit `oracle ecosystem connect`
  // still runs them) but callers on the hot bootstrap path pass
  // `checkHealth: false` to skip the execFileSync-based probes — those
  // were adding ~7s to every CLI invocation.
  const discoverOpts = {
    repoRoot,
    checkHealth: options.checkHealth !== false,
  };
  if (Array.isArray(options.roots)) discoverOpts.roots = options.roots;
  const eco = await discoverEcosystem(discoverOpts);
  const wired = [];

  for (const [peerName, peerCfg] of Object.entries(selfManifest.peers || {})) {
    const peer = eco.byName(peerName);
    if (!peer || !peer.health?.alive) continue;
    if (!peerCfg.autoWire) continue;
    const bindingPath = path.isAbsolute(peerCfg.autoWire)
      ? peerCfg.autoWire
      : path.join(repoRoot, peerCfg.autoWire);
    if (!fs.existsSync(bindingPath)) continue;
    try {
      const binding = require(bindingPath);
      if (typeof binding.wire === 'function') {
        binding.wire(peer, { repoRoot });
        wired.push({ peer: peerName, role: peer.role, binding: bindingPath });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[ecosystem:autoWire]', peerName, e.message);
    }
  }

  return { wired, ecosystem: eco };
}

// ─── Awaitable wire-once helper ────────────────────────────────────────────

// Memoized promise so every caller in the same process shares one
// autoWireAll invocation. Commands that need the ecosystem (e.g.
// `oracle ecosystem connect`, `oracle resolve` with Void cascade)
// can `await ensureWired()` and know the bindings are installed.
let _wireOnce = null;
let _wireOnceRoot = null;

/**
 * Trigger autoWireAll once per process and return the resolving
 * promise. Subsequent calls for the same repoRoot return the cached
 * promise, so commands that depend on the ecosystem being wired can
 * `await ensureWired()` without blocking the CLI bootstrap path.
 *
 * The bootstrap call in cli/commands/admin.js is still fire-and-forget
 * (it can't block CLI startup), but it primes this cache so downstream
 * commands pay no latency when they await.
 */
function ensureWired(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  if (_wireOnce && _wireOnceRoot === repoRoot) return _wireOnce;
  _wireOnceRoot = repoRoot;
  _wireOnce = autoWireAll({ ...options, repoRoot }).catch((e) => {
    // Reset on failure so a retry can try again on next call.
    _wireOnce = null;
    _wireOnceRoot = null;
    throw e;
  });
  return _wireOnce;
}

function resetEcosystemWiring() {
  _wireOnce = null;
  _wireOnceRoot = null;
}

function loadSelfManifest(repoRoot) {
  const p = path.join(repoRoot, MANIFEST_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return null; }
}

module.exports = {
  discoverEcosystem,
  discoverStatic,
  announceModule,
  readRegistry,
  runHealthCheck,
  autoWireAll,
  ensureWired,
  resetEcosystemWiring,
  loadSelfManifest,
  MANIFEST_FILE,
  USER_DIR,
  REPO_DIR,
};
