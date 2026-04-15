'use strict';

/**
 * Oracle session compliance ledger.
 *
 * The CLAUDE.md mandates are currently social — instructions an agent
 * can read and ignore. This module makes them operational. It tracks
 * every file-touch, search, audit, feedback, and pattern-pull event in
 * a per-session ledger and produces a compliance score that blocks
 * non-compliant commits.
 *
 * Design goals:
 *
 *   1. Every tool use has a ledger entry. Write/Edit/Read/Bash all
 *      emit events that this module consumes off the event bus.
 *   2. Every rule in the CLAUDE.md maps to a named check:
 *        - sessionStart:       hooks install / sync pull was called
 *        - queryBeforeWrite:   oracle search OR oracle resolve was
 *                              called for the file being written, OR
 *                              a bypass reason was recorded
 *        - feedbackLoop:       oracle feedback was called after every
 *                              pattern.pulled event
 *        - sessionEnd:         oracle audit summary + auto-submit
 *                              were called before end
 *   3. Non-compliance is LOUD. Every `audit check`, `audit summary`,
 *      pre-commit run, and CLI command shows the current compliance
 *      score when it's below 100%.
 *   4. Bypass is explicit. A structured `oracle session bypass
 *      <reason>` records the exemption so post-hoc audits see exactly
 *      why the workflow was skipped.
 *   5. Pre-commit blocks by default when ORACLE_WORKFLOW=enforce is set.
 *
 * Data model:
 *   session = {
 *     id, startedAt, endedAt,
 *     events: [{ kind, payload, at }],
 *     bypasses: [{ reason, at, files }],
 *     filesWritten: Set<path>,
 *     filesSearched: Set<path>,
 *     patternsPulled: [{id, file, fedBack}],
 *     hooksInstalled: bool,
 *     sessionEndCalled: bool,
 *   }
 *
 * Storage lives in the unified OracleStorage namespace 'sessions', so
 * every session is persisted and replayable across harness restarts.
 */

const { getStorage } = require('./storage');
const { getEventBus, EVENTS } = require('./events');

const NAMESPACE = 'sessions';
const CURRENT_KEY = 'current';

// ─── Session lifecycle ─────────────────────────────────────────────────────

function startSession(repoRoot, options = {}) {
  const storage = options.storage || getStorage(repoRoot);
  const ns = storage.namespace(NAMESPACE);
  const existing = ns.get(CURRENT_KEY);
  // Resume an existing session if one is open; starting twice is OK.
  if (existing && existing.endedAt == null) {
    return existing;
  }
  const session = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    endedAt: null,
    events: [],
    bypasses: [],
    filesWritten: [],
    filesSearched: [],
    filesAudited: [],
    filesRead: [],
    touchedIdentifiers: [],
    patternsPulled: [],
    hooksInstalled: probeHooksInstalled(repoRoot),
    sessionEndCalled: false,
    agent: options.agent || process.env.ORACLE_AGENT || 'unknown',
  };
  if (session.hooksInstalled) {
    // Seed the ledger with the observation so reporters don't re-probe.
    session.events.push({
      kind: 'hooks.installed',
      payload: { source: 'filesystem-probe' },
      at: new Date().toISOString(),
    });
  }
  ns.set(CURRENT_KEY, session);
  return session;
}

/**
 * Probe the filesystem to see if our git hooks are already on disk.
 * Used by startSession so a fresh session doesn't falsely report
 * "hooks not installed" when a previous session already installed them.
 */
function probeHooksInstalled(repoRoot) {
  try {
    const { checkHooksInstalled } = require('./preflight');
    const result = checkHooksInstalled(repoRoot || process.cwd());
    return !!result.installed;
  } catch { return false; }
}

function getCurrentSession(repoRoot, options = {}) {
  const storage = options.storage || getStorage(repoRoot);
  const ns = storage.namespace(NAMESPACE);
  return ns.get(CURRENT_KEY);
}

function saveSession(session, repoRoot, options = {}) {
  const storage = options.storage || getStorage(repoRoot);
  const ns = storage.namespace(NAMESPACE);
  ns.set(CURRENT_KEY, session);
  // Also archive by id so the history log is queryable later.
  try { ns.set(session.id, session); } catch { /* ignore */ }
}

function endSession(repoRoot, options = {}) {
  const session = getCurrentSession(repoRoot, options);
  if (!session) return null;
  session.endedAt = new Date().toISOString();
  session.sessionEndCalled = true;
  saveSession(session, repoRoot, options);
  return session;
}

// ─── Event recording ───────────────────────────────────────────────────────

function recordEvent(session, kind, payload) {
  if (!session) return;
  if (!session.events) session.events = [];
  session.events.push({
    kind,
    payload: compactPayload(payload),
    at: new Date().toISOString(),
  });

  // Maintain denormalized indexes for fast compliance queries.
  switch (kind) {
    case 'hooks.installed':
      session.hooksInstalled = true;
      break;
    case 'search':
      if (payload?.file) {
        if (!session.filesSearched.includes(payload.file)) session.filesSearched.push(payload.file);
      }
      break;
    case 'write':
    case 'edit':
      if (payload?.file) {
        if (!session.filesWritten.includes(payload.file)) session.filesWritten.push(payload.file);
      }
      break;
    case 'audit':
      if (payload?.file) {
        if (!session.filesAudited.includes(payload.file)) session.filesAudited.push(payload.file);
      }
      break;
    case 'read':
      // Track files the agent has read AND the identifiers visible
      // in those files. The grounding check uses this set to decide
      // whether a function call in a written file is grounded in
      // observed reality or fabricated. Populated by Claude Code's
      // PostToolUse hook on Read, and by `oracle session record-read`.
      if (payload?.file) {
        if (!session.filesRead) session.filesRead = [];
        if (!session.filesRead.includes(payload.file)) session.filesRead.push(payload.file);
      }
      if (payload?.identifiers && Array.isArray(payload.identifiers)) {
        if (!session.touchedIdentifiers) session.touchedIdentifiers = [];
        // Cap at 5000 to keep the ledger small. With realistic reads
        // we'll grow to a few hundred per file; the cap is a safety net.
        const set = new Set(session.touchedIdentifiers);
        for (const id of payload.identifiers) {
          if (set.size >= 5000) break;
          set.add(id);
        }
        session.touchedIdentifiers = Array.from(set);
      }
      break;
    case 'pattern.pulled':
      session.patternsPulled.push({
        id: payload?.id || payload?.patternId,
        file: payload?.file,
        pulledAt: new Date().toISOString(),
        fedBack: false,
      });
      break;
    case 'pattern.feedback': {
      const target = session.patternsPulled.find(p => p.id === (payload?.id || payload?.patternId) && !p.fedBack);
      if (target) target.fedBack = true;
      break;
    }
    case 'bypass':
      session.bypasses.push({
        reason: payload?.reason || 'unspecified',
        files: payload?.files || [],
        at: new Date().toISOString(),
      });
      break;
    // Self-reported todo state — mitigates the "friction-exit" failure
    // mode where the agent abandons an in-progress task mid-turn. When
    // the session ends with any todo still open, the todosAllClosed
    // check fails and the score drops.
    case 'todo.open':
      if (!session.todos) session.todos = [];
      session.todos.push({
        id: payload?.id || `todo-${session.todos.length + 1}`,
        content: payload?.content || '',
        status: 'open',
        openedAt: new Date().toISOString(),
      });
      break;
    case 'todo.close': {
      if (!session.todos) session.todos = [];
      const id = payload?.id;
      const match = session.todos.find(t => t.id === id && t.status !== 'closed');
      if (match) {
        match.status = 'closed';
        match.closedAt = new Date().toISOString();
      }
      break;
    }
    case 'todo.defer': {
      if (!session.todos) session.todos = [];
      const id = payload?.id;
      const match = session.todos.find(t => t.id === id && t.status !== 'closed');
      if (match) {
        match.status = 'deferred';
        match.reason = payload?.reason || 'no reason given';
        match.deferredAt = new Date().toISOString();
      }
      break;
    }
    case 'session.end':
      session.sessionEndCalled = true;
      break;
  }
}

function compactPayload(p) {
  if (!p || typeof p !== 'object') return p;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '…';
    else if (Array.isArray(v) && v.length > 10) out[k] = { length: v.length };
    else out[k] = v;
  }
  return out;
}

// ─── Compliance scoring ────────────────────────────────────────────────────

/**
 * Score a session's compliance on a 0..1 scale and produce a list of
 * human-readable violations. The scoring is intentionally simple and
 * conservative — a session either passes a check or it doesn't.
 *
 *   checks:
 *     1. hooksInstalled                     weight 0.15
 *     2. queryBeforeWrite (every write has
 *        a search OR bypass)                weight 0.40
 *     3. feedbackLoop (every pattern pull
 *        has a feedback OR bypass)          weight 0.20
 *     4. auditOnWrite (every written file
 *        was audited in-session)            weight 0.15
 *     5. sessionEndCalled                   weight 0.10
 */
function scoreCompliance(session) {
  if (!session) {
    return { score: 0, status: 'no-session', violations: ['no active session — run `oracle session start`'] };
  }

  const violations = [];
  let score = 0;

  // 1. hooks installed
  if (session.hooksInstalled) score += 0.15;
  else violations.push({
    check: 'hooksInstalled',
    weight: 0.15,
    message: 'git hooks not installed — run `oracle hooks install`',
    fix: 'oracle hooks install',
  });

  // 2. query-before-write
  const writeSet = new Set(session.filesWritten || []);
  const searchSet = new Set(session.filesSearched || []);
  const bypassedFiles = new Set(
    (session.bypasses || []).flatMap(b => b.files || [])
  );
  const unsearchedWrites = [...writeSet].filter(f => !searchSet.has(f) && !bypassedFiles.has(f));
  if (writeSet.size === 0) {
    score += 0.40;
  } else {
    const ratio = (writeSet.size - unsearchedWrites.length) / writeSet.size;
    score += 0.40 * ratio;
    if (unsearchedWrites.length > 0) {
      violations.push({
        check: 'queryBeforeWrite',
        weight: 0.40,
        message: `${unsearchedWrites.length}/${writeSet.size} file(s) were written without a preceding oracle search`,
        files: unsearchedWrites.slice(0, 10),
        fix: 'oracle search "<what the file does>" OR oracle session bypass "<reason>" --files <f>',
      });
    }
  }

  // 3. feedback loop on pulled patterns
  const unfed = (session.patternsPulled || []).filter(p => !p.fedBack);
  const pulled = (session.patternsPulled || []).length;
  if (pulled === 0) {
    score += 0.20;
  } else {
    score += 0.20 * ((pulled - unfed.length) / pulled);
    if (unfed.length > 0) {
      violations.push({
        check: 'feedbackLoop',
        weight: 0.20,
        message: `${unfed.length}/${pulled} pulled pattern(s) have no feedback`,
        patternIds: unfed.map(p => p.id).slice(0, 10),
        fix: 'oracle feedback --id <patternId> --success',
      });
    }
  }

  // 4. audit-on-write
  const auditSet = new Set(session.filesAudited || []);
  const unauditedWrites = [...writeSet].filter(f => !auditSet.has(f) && !bypassedFiles.has(f));
  if (writeSet.size === 0) {
    score += 0.15;
  } else {
    score += 0.15 * ((writeSet.size - unauditedWrites.length) / writeSet.size);
    if (unauditedWrites.length > 0) {
      violations.push({
        check: 'auditOnWrite',
        weight: 0.15,
        message: `${unauditedWrites.length}/${writeSet.size} written file(s) were never audited this session`,
        files: unauditedWrites.slice(0, 10),
        fix: 'oracle audit check --file <file>',
      });
    }
  }

  // 5. session end sweep (weight reduced to make room for todo check)
  if (session.sessionEndCalled) score += 0.05;
  else violations.push({
    check: 'sessionEndCalled',
    weight: 0.05,
    message: 'session end sweep not yet run',
    fix: 'oracle session end (also runs `auto-submit` and `audit summary`)',
  });

  // 6. todosAllClosed — the friction-exit mitigation.
  // Any todo still marked `open` at scoring time counts as an
  // abandoned task. `deferred` todos are fine — a deferral is an
  // explicit decision to pause. This check catches the failure
  // mode where the agent silently stops mid-task.
  const todos = session.todos || [];
  const openTodos = todos.filter(t => t.status === 'open');
  if (todos.length === 0) {
    score += 0.05; // no todos tracked, pass by default
  } else if (openTodos.length === 0) {
    score += 0.05;
  } else {
    const closedRatio = (todos.length - openTodos.length) / todos.length;
    score += 0.05 * closedRatio;
    violations.push({
      check: 'todosAllClosed',
      weight: 0.05,
      message: `${openTodos.length}/${todos.length} todo(s) still open — unresolved tasks indicate a friction-exit`,
      todos: openTodos.slice(0, 5).map(t => ({ id: t.id, content: t.content })),
      fix: 'Either close each todo (task done) or defer it explicitly with a reason',
    });
  }

  return {
    score: Math.round(score * 100) / 100,
    status: score >= 0.9 ? 'compliant' : score >= 0.5 ? 'partial' : 'non-compliant',
    violations,
    stats: {
      filesWritten: writeSet.size,
      filesSearched: searchSet.size,
      filesAudited: auditSet.size,
      patternsPulled: pulled,
      patternsFedBack: pulled - unfed.length,
      bypassesCount: (session.bypasses || []).length,
      todosOpen: openTodos.length,
      todosTotal: todos.length,
    },
  };
}

// ─── Wiring from the event bus ─────────────────────────────────────────────

let _wired = false;
let _offHandlers = [];

function wireCompliance(repoRoot, options = {}) {
  if (_wired && !options.force) return () => {};
  if (_wired) _off();
  const bus = getEventBus();
  const storage = options.storage || getStorage(repoRoot);

  function withSession(fn) {
    let session = getCurrentSession(repoRoot, { storage });
    if (!session) session = startSession(repoRoot, { storage });
    fn(session);
    saveSession(session, repoRoot, { storage });
  }

  _offHandlers = [
    // Search events
    bus.on('search', (p) => withSession(s => recordEvent(s, 'search', p))),
    bus.on('resolve', (p) => withSession(s => recordEvent(s, 'search', p))),

    // Write / edit events — fired by the harness through any wiring
    // layer that cares to emit them. The CLI can also emit these
    // explicitly via `oracle session record write --file <f>`.
    bus.on('write', (p) => withSession(s => recordEvent(s, 'write', p))),
    bus.on('edit', (p) => withSession(s => recordEvent(s, 'edit', p))),

    // Audit events — fired by audit check / audit summary
    bus.on(EVENTS.AUDIT_FINDING, (p) => withSession(s => recordEvent(s, 'audit', { file: p?.file }))),
    bus.on('audit.file-scanned', (p) => withSession(s => recordEvent(s, 'audit', p))),

    // Hooks install event
    bus.on('hooks.installed', (p) => withSession(s => recordEvent(s, 'hooks.installed', p))),

    // Pattern pull + feedback
    bus.on(EVENTS.PATTERN_PULLED, (p) => withSession(s => recordEvent(s, 'pattern.pulled', p))),
    bus.on(EVENTS.PATTERN_FEEDBACK, (p) => withSession(s => recordEvent(s, 'pattern.feedback', p))),

    // Explicit bypass
    bus.on('session.bypass', (p) => withSession(s => recordEvent(s, 'bypass', p))),

    // Todo lifecycle — friction-exit mitigation. The agent emits
    // `session.todo.open` when starting a task and `session.todo.close`
    // when finishing. `session.todo.defer` is the explicit pause with
    // a reason. An open todo at session end drops the compliance score.
    bus.on('session.todo.open',  (p) => withSession(s => recordEvent(s, 'todo.open',  p))),
    bus.on('session.todo.close', (p) => withSession(s => recordEvent(s, 'todo.close', p))),
    bus.on('session.todo.defer', (p) => withSession(s => recordEvent(s, 'todo.defer', p))),

    // Session end sweep
    bus.on('session.end', (p) => withSession(s => recordEvent(s, 'session.end', p))),
  ];

  _wired = true;
  return _off;
}

function _off() {
  for (const off of _offHandlers) { try { off && off(); } catch { /* ignore */ } }
  _offHandlers = [];
  _wired = false;
}

function resetCompliance() { _off(); }

// ─── Check + gate API ─────────────────────────────────────────────────────

/**
 * Is a commit allowed under current compliance?
 * Returns { allowed, score, violations }. Callers (pre-commit hook)
 * decide whether to block based on the score and ORACLE_WORKFLOW env.
 */
function checkCommitAllowed(repoRoot, stagedFiles, options = {}) {
  const session = getCurrentSession(repoRoot, options);
  if (!session) {
    return {
      allowed: false,
      score: 0,
      reason: 'no active session — run `oracle session start`',
      violations: [{ check: 'sessionStart', message: 'no session', fix: 'oracle session start' }],
    };
  }
  const score = scoreCompliance(session);
  const writeSet = new Set(session.filesWritten || []);
  const searchSet = new Set(session.filesSearched || []);
  const auditSet = new Set(session.filesAudited || []);
  const bypassedFiles = new Set((session.bypasses || []).flatMap(b => b.files || []));

  // For every staged file: must have been searched OR bypassed OR audited
  // (audit counts as "the agent was aware of the file").
  const stagedViolations = [];
  for (const f of (stagedFiles || [])) {
    const touched = writeSet.has(f) || writeSet.has(f.split('/').pop());
    const searched = searchSet.has(f) || searchSet.has(f.split('/').pop());
    const audited = auditSet.has(f) || auditSet.has(f.split('/').pop());
    const bypassed = bypassedFiles.has(f) || bypassedFiles.has(f.split('/').pop());
    if (touched && !searched && !audited && !bypassed) {
      stagedViolations.push({
        file: f,
        reason: 'written without preceding search OR audit OR bypass',
        fix: `oracle search "<what ${f} does>" OR oracle audit check --file ${f}`,
      });
    }
  }

  const enforce = (process.env.ORACLE_WORKFLOW || '').toLowerCase() === 'enforce';
  const allowed = stagedViolations.length === 0 || !enforce;

  return {
    allowed,
    score: score.score,
    status: score.status,
    violations: score.violations,
    stagedViolations,
    enforce,
  };
}

/**
 * Produce a short compliance banner string suitable for appending to
 * any CLI command output. Used by audit check / audit summary to keep
 * the score visible.
 */
function complianceBanner(repoRoot, options = {}) {
  const session = getCurrentSession(repoRoot, options);
  if (!session) return null;
  const score = scoreCompliance(session);
  if (score.status === 'compliant') return null;
  return {
    score: score.score,
    status: score.status,
    violations: score.violations,
    topViolation: score.violations[0] || null,
  };
}

module.exports = {
  startSession,
  endSession,
  getCurrentSession,
  saveSession,
  recordEvent,
  scoreCompliance,
  checkCommitAllowed,
  complianceBanner,
  wireCompliance,
  resetCompliance,
  NAMESPACE,
};
