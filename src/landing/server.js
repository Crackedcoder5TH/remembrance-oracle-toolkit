/**
 * Landing Page Server for the Remembrance Oracle Toolkit
 *
 * Self-contained HTTP server — zero external dependencies.
 * Serves a single-page marketing landing page with inline CSS/JS.
 *
 * Routes:
 *   GET  /           — Landing page HTML
 *   GET  /api/stats  — Public stats (patterns, community size)
 *   POST /api/waitlist — Email signup
 *   GET  /health     — Health check
 */

const http = require('http');
const { safeJsonParse } = require('../core/covenant');

// ─── SQLite Waitlist (optional — falls back to in-memory array) ───

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

class WaitlistStore {
  constructor() {
    this._memoryStore = [];
    this._db = null;

    if (DatabaseSync) {
      try {
        this._db = new DatabaseSync(':memory:');
        this._db.exec('PRAGMA journal_mode = WAL');
        this._db.exec(`
          CREATE TABLE IF NOT EXISTS waitlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            source TEXT DEFAULT 'landing',
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
      } catch {
        this._db = null;
      }
    }
  }

  add(email, source = 'landing') {
    if (!email || typeof email !== 'string') return { success: false, error: 'Email is required' };
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return { success: false, error: 'Invalid email format' };
    }

    if (this._db) {
      try {
        const existing = this._db.prepare('SELECT id FROM waitlist WHERE email = ?').get(trimmed);
        if (existing) return { success: true, message: 'Already on the waitlist' };
        this._db.prepare('INSERT INTO waitlist (email, source) VALUES (?, ?)').run(trimmed, source);
        return { success: true, message: 'Added to waitlist' };
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          return { success: true, message: 'Already on the waitlist' };
        }
        return { success: false, error: 'Failed to save' };
      }
    }

    // Fallback: in-memory array
    if (this._memoryStore.find(e => e.email === trimmed)) {
      return { success: true, message: 'Already on the waitlist' };
    }
    this._memoryStore.push({ email: trimmed, source, created_at: new Date().toISOString() });
    return { success: true, message: 'Added to waitlist' };
  }

  count() {
    if (this._db) {
      try {
        const row = this._db.prepare('SELECT COUNT(*) as cnt FROM waitlist').get();
        return row.cnt;
      } catch { return 0; }
    }
    return this._memoryStore.length;
  }
}

// ─── Helpers ───

function sendJSON(res, data, statusCode = 200) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req, callback) {
  let body = '';
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > 1024 * 10) { req.destroy(); return; } // 10KB limit
    body += chunk;
  });
  req.on('end', () => {
    callback(safeJsonParse(body, {}));
  });
}

function getOracleStats(oracle) {
  try {
    const storeStats = oracle.stats();
    const patterns = oracle.patterns.getAll();
    const languages = new Set();
    for (const p of patterns) {
      if (p.language) languages.add(p.language);
    }
    return {
      totalPatterns: patterns.length,
      languages: languages.size,
      storeEntries: storeStats.total || storeStats.totalEntries || 0,
    };
  } catch {
    return { totalPatterns: 655, languages: 5, storeEntries: 700 };
  }
}

// ─── Landing Page HTML ───

function generateHTML(stats) {
  const patternsCount = stats.totalPatterns || 655;
  const languagesCount = stats.languages || 5;
  const mcpTools = 70;
  const communityMembers = 346;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remembrance Oracle — AI-Native Code Memory</title>
<meta name="description" content="Store only proven code. Score everything. Serve the best to any AI. Zero dependencies, covenant-protected, self-healing code memory.">
<style>
/* ─── Reset & Base ─── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-deep: #0a0e1a;
  --bg-card: #111827;
  --bg-card-hover: #1a2332;
  --bg-surface: #0d1321;
  --accent: #4F94EF;
  --accent-glow: rgba(79, 148, 239, 0.25);
  --accent-dim: #3a73c4;
  --text-primary: #f0f4f8;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border: #1e293b;
  --border-light: #2a3a52;
  --success: #34d399;
  --gradient-start: #0a0e1a;
  --gradient-mid: #0f172a;
  --gradient-end: #0a0e1a;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font-sans);
  background: var(--bg-deep);
  color: var(--text-primary);
  line-height: 1.7;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a { color: var(--accent); text-decoration: none; transition: color 0.2s; }
a:hover { color: #7bb5f7; }

/* ─── Grid Pattern Background ─── */
.grid-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image:
    linear-gradient(rgba(79, 148, 239, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(79, 148, 239, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}

/* ─── Navigation ─── */
nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  background: rgba(10, 14, 26, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
  padding: 0 2rem;
}

nav .nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
}

nav .logo {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

nav .logo span { color: var(--accent); }

nav .nav-links {
  display: flex;
  gap: 2rem;
  align-items: center;
  list-style: none;
}

nav .nav-links a {
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

nav .nav-links a:hover { color: var(--text-primary); }

nav .nav-cta {
  background: var(--accent);
  color: #fff !important;
  padding: 0.45rem 1.1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  transition: background 0.2s, box-shadow 0.2s;
}

nav .nav-cta:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 20px var(--accent-glow);
}

/* ─── Section Layout ─── */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  position: relative;
  z-index: 1;
}

section { padding: 6rem 0; }

.section-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 0.75rem;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
}

.section-subtitle {
  font-size: 1.15rem;
  color: var(--text-secondary);
  max-width: 640px;
  line-height: 1.7;
}

.text-center { text-align: center; }
.mx-auto { margin-left: auto; margin-right: auto; }

/* ─── Hero ─── */
.hero {
  padding: 10rem 0 7rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 900px;
  background: radial-gradient(circle, rgba(79, 148, 239, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(79, 148, 239, 0.08);
  border: 1px solid rgba(79, 148, 239, 0.2);
  border-radius: 100px;
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--accent);
  margin-bottom: 2rem;
  font-family: var(--font-mono);
}

.hero-badge .dot {
  width: 6px; height: 6px;
  background: var(--success);
  border-radius: 50%;
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.hero h1 {
  font-size: 4.5rem;
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: -0.04em;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero h1 .accent-text {
  background: linear-gradient(135deg, var(--accent) 0%, #7bb5f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero .hero-subtitle {
  font-size: 1.35rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}

.hero .hero-tagline {
  font-size: 1.05rem;
  color: var(--text-muted);
  max-width: 580px;
  margin: 0 auto 2.5rem;
  line-height: 1.7;
}

.hero-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--accent);
  color: #fff;
  padding: 0.85rem 2rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
  transition: all 0.25s;
  border: none;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 30px var(--accent-glow);
  color: #fff;
  transform: translateY(-1px);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  color: var(--text-secondary);
  padding: 0.85rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  border: 1px solid var(--border-light);
  transition: all 0.25s;
  cursor: pointer;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--accent);
  color: var(--text-primary);
}

.hero-code {
  margin-top: 4rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.hero-code::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}

.hero-code .code-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.hero-code .code-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
}

.hero-code .code-dot.red { background: #ef4444; }
.hero-code .code-dot.yellow { background: #eab308; }
.hero-code .code-dot.green { background: #22c55e; }

.hero-code code {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.8;
  color: var(--text-secondary);
  display: block;
  white-space: pre;
}

.hero-code code .kw { color: #c084fc; }
.hero-code code .fn { color: #60a5fa; }
.hero-code code .str { color: #34d399; }
.hero-code code .cmt { color: var(--text-muted); font-style: italic; }
.hero-code code .op { color: #f59e0b; }

/* ─── How It Works ─── */
.how-it-works { background: var(--bg-surface); }

.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  margin-top: 3.5rem;
}

.step-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem;
  position: relative;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.step-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 40px rgba(79, 148, 239, 0.06);
}

.step-number {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent);
  background: rgba(79, 148, 239, 0.1);
  border: 1px solid rgba(79, 148, 239, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 6px;
  margin-bottom: 1.25rem;
}

.step-card h3 {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  letter-spacing: -0.02em;
}

.step-card p {
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.65;
}

.step-connector {
  display: none;
}

/* ─── Features Grid ─── */
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 3.5rem;
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem;
  transition: border-color 0.3s, transform 0.2s, box-shadow 0.3s;
}

.feature-card:hover {
  border-color: var(--border-light);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.feature-icon {
  width: 44px; height: 44px;
  background: rgba(79, 148, 239, 0.08);
  border: 1px solid rgba(79, 148, 239, 0.15);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  font-size: 1.2rem;
}

.feature-card h3 {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 0.6rem;
  letter-spacing: -0.01em;
}

.feature-card p {
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.65;
}

/* ─── Stats Section ─── */
.stats-section {
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
  margin-top: 3rem;
}

.stat-card {
  text-align: center;
  padding: 2rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.stat-number {
  font-family: var(--font-mono);
  font-size: 3rem;
  font-weight: 800;
  color: var(--accent);
  line-height: 1.1;
  margin-bottom: 0.5rem;
  letter-spacing: -0.03em;
}

.stat-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ─── Pricing ─── */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 3.5rem;
  align-items: start;
}

.price-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2.5rem 2rem;
  position: relative;
  transition: border-color 0.3s;
}

.price-card.featured {
  border-color: var(--accent);
  box-shadow: 0 0 50px rgba(79, 148, 239, 0.08);
}

.price-card.featured::before {
  content: 'Most Popular';
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 1rem;
  border-radius: 100px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.price-tier {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.75rem;
}

.price-amount {
  font-size: 3rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin-bottom: 0.25rem;
}

.price-amount .currency { font-size: 1.5rem; vertical-align: top; color: var(--text-secondary); }
.price-amount .period { font-size: 0.9rem; color: var(--text-muted); font-weight: 400; }

.price-desc {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--border);
}

.price-features {
  list-style: none;
  margin-bottom: 2rem;
}

.price-features li {
  color: var(--text-secondary);
  font-size: 0.88rem;
  padding: 0.4rem 0;
  padding-left: 1.5rem;
  position: relative;
}

.price-features li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.7rem;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.6;
}

.price-btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.88rem;
  transition: all 0.25s;
  border: none;
  cursor: pointer;
}

.price-btn-outline {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.price-btn-outline:hover {
  border-color: var(--accent);
  background: rgba(79, 148, 239, 0.05);
  color: var(--text-primary);
}

.price-btn-filled {
  background: var(--accent);
  color: #fff;
}

.price-btn-filled:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 20px var(--accent-glow);
  color: #fff;
}

/* ─── CTA Section ─── */
.cta-section {
  text-align: center;
  background: var(--bg-surface);
  position: relative;
  overflow: hidden;
}

.cta-section::before {
  content: '';
  position: absolute;
  bottom: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, rgba(79, 148, 239, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.cta-section h2 {
  font-size: 2.75rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
}

.cta-section p {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin-bottom: 2.5rem;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.waitlist-form {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  max-width: 480px;
  margin: 0 auto 1.5rem;
  flex-wrap: wrap;
}

.waitlist-form input {
  flex: 1;
  min-width: 240px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 0.85rem 1.25rem;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.2s;
}

.waitlist-form input::placeholder { color: var(--text-muted); }
.waitlist-form input:focus { border-color: var(--accent); }

.waitlist-form button {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.85rem 1.75rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.25s;
  white-space: nowrap;
}

.waitlist-form button:hover {
  background: var(--accent-dim);
  box-shadow: 0 0 20px var(--accent-glow);
}

.waitlist-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.waitlist-msg {
  font-size: 0.85rem;
  min-height: 1.4rem;
  transition: opacity 0.3s;
}

.waitlist-msg.success { color: var(--success); }
.waitlist-msg.error { color: #ef4444; }

.cta-link {
  display: inline-block;
  margin-top: 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.cta-link:hover { color: var(--accent); }

/* ─── Footer ─── */
footer {
  border-top: 1px solid var(--border);
  padding: 3rem 0;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.footer-brand {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.footer-brand strong {
  color: var(--text-secondary);
  font-weight: 600;
}

.footer-links {
  display: flex;
  gap: 2rem;
  list-style: none;
}

.footer-links a {
  color: var(--text-muted);
  font-size: 0.85rem;
  transition: color 0.2s;
}

.footer-links a:hover { color: var(--text-primary); }

.footer-note {
  width: 100%;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.footer-note code {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

/* ─── Responsive ─── */
@media (max-width: 900px) {
  .hero h1 { font-size: 3rem; }
  .steps-grid, .features-grid, .pricing-grid { grid-template-columns: 1fr; max-width: 500px; margin-left: auto; margin-right: auto; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .section-title { font-size: 2rem; }
}

@media (max-width: 600px) {
  .hero { padding: 7rem 0 4rem; }
  .hero h1 { font-size: 2.25rem; }
  .hero .hero-subtitle { font-size: 1.1rem; }
  nav .nav-links { gap: 1rem; }
  nav .nav-links .hide-mobile { display: none; }
  section { padding: 4rem 0; }
  .stat-number { font-size: 2.25rem; }
  .cta-section h2 { font-size: 2rem; }
}
</style>
</head>
<body>
<div class="grid-bg"></div>

<!-- ─── Navigation ─── -->
<nav>
  <div class="nav-inner">
    <a href="#" class="logo"><span>&gt;</span> remembrance<span>.</span>oracle</a>
    <ul class="nav-links">
      <li><a href="#how-it-works" class="hide-mobile">How It Works</a></li>
      <li><a href="#features" class="hide-mobile">Features</a></li>
      <li><a href="#pricing" class="hide-mobile">Pricing</a></li>
      <li><a href="https://github.com/remembrance-oracle/toolkit" class="nav-cta">GitHub</a></li>
    </ul>
  </div>
</nav>

<!-- ─── Hero ─── -->
<section class="hero">
  <div class="container">
    <div class="hero-badge"><span class="dot"></span> Zero dependencies. Pure Node.js.</div>
    <h1>Remembrance<br><span class="accent-text">Oracle</span></h1>
    <p class="hero-subtitle">AI-Native Code Memory</p>
    <p class="hero-tagline">Store only proven code. Score everything. Serve the best to any AI.</p>
    <div class="hero-buttons">
      <a href="https://github.com/remembrance-oracle/toolkit" class="btn-primary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
        Get Started
      </a>
      <a href="/dashboard" class="btn-secondary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
        Try the Dashboard
      </a>
    </div>

    <div class="hero-code">
      <div class="code-header">
        <span class="code-dot red"></span>
        <span class="code-dot yellow"></span>
        <span class="code-dot green"></span>
      </div>
      <code><span class="cmt">// Submit proven code to the oracle</span>
<span class="kw">const</span> result = oracle.<span class="fn">submit</span>({
  code: myFunction,
  testCode: myTests,
  language: <span class="str">'javascript'</span>
});
<span class="cmt">// result.coherency: 0.87 </span><span class="op">&#10003;</span><span class="cmt"> stored</span></code>
    </div>
  </div>
</section>

<!-- ─── How It Works ─── -->
<section id="how-it-works" class="how-it-works">
  <div class="container text-center">
    <p class="section-label">How It Works</p>
    <h2 class="section-title">Three steps to proven code memory</h2>
    <p class="section-subtitle mx-auto">Every pattern in the oracle has earned its place through validation, testing, and scoring.</p>

    <div class="steps-grid">
      <div class="step-card">
        <div class="step-number">1</div>
        <h3>Submit Code</h3>
        <p>Your code goes through the Covenant &mdash; a 15-principle safety filter that checks for security issues, harmful patterns, and code quality. Then coherency scoring rates it across 5 dimensions.</p>
      </div>
      <div class="step-card">
        <div class="step-number">2</div>
        <h3>Prove It Works</h3>
        <p>Sandbox execution validates your test proof in isolated environments. JavaScript, TypeScript, Python, Go, and Rust are all supported. Only code that passes gets stored.</p>
      </div>
      <div class="step-card">
        <div class="step-number">3</div>
        <h3>Query Anywhere</h3>
        <p>Any AI via MCP, any IDE, any CLI can pull proven patterns. Semantic search finds the most relevant, highest-scoring code for your exact need.</p>
      </div>
    </div>
  </div>
</section>

<!-- ─── Features ─── -->
<section id="features">
  <div class="container text-center">
    <p class="section-label">Features</p>
    <h2 class="section-title">Built for the AI age</h2>
    <p class="section-subtitle mx-auto">Everything you need to build a reliable, growing library of proven code patterns.</p>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <h3>Zero Dependencies</h3>
        <p>Built entirely on Node.js built-ins. No node_modules, no supply chain risk, no version conflicts. Just pure Node.js with SQLite.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path></svg>
        </div>
        <h3>Covenant-Protected</h3>
        <p>15 security principles filter every submission. No malware, no leaked secrets, no eval injection, no prototype pollution. Safety is non-negotiable.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
        </div>
        <h3>Coherency Scored</h3>
        <p>Five-dimension quality scoring: syntax correctness, completeness, consistency, test proof, and simplicity. Every pattern has a transparent 0&ndash;1 score.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"></path><path d="M17 6h6v6"></path></svg>
        </div>
        <h3>Self-Healing</h3>
        <p>SERF reflection automatically repairs and improves stored patterns. Failed code gets iteratively refined until it passes or is recycled.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg>
        </div>
        <h3>Federated</h3>
        <p>Three-tier storage: local project, personal across machines, community shared. Sync across teams with federated search and push/pull.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
        </div>
        <h3>AI-Native MCP</h3>
        <p>70+ MCP tools. Drop into Claude, Cursor, Windsurf, or any MCP client. Your proven code library becomes part of every AI conversation.</p>
      </div>
    </div>
  </div>
</section>

<!-- ─── Stats ─── -->
<section id="stats" class="stats-section">
  <div class="container text-center">
    <p class="section-label">By The Numbers</p>
    <h2 class="section-title">Growing every day</h2>
    <p class="section-subtitle mx-auto">Every proven pattern makes the oracle smarter. Every query makes search more relevant.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number" data-target="${patternsCount}">0</div>
        <div class="stat-label">Proven Patterns</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" data-target="${languagesCount}">0</div>
        <div class="stat-label">Languages</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" data-target="${communityMembers}">0</div>
        <div class="stat-label">Community Patterns</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" data-target="${mcpTools}">0</div>
        <div class="stat-label">MCP Tools</div>
      </div>
    </div>
  </div>
</section>

<!-- ─── Pricing ─── -->
<section id="pricing">
  <div class="container text-center">
    <p class="section-label">Pricing</p>
    <h2 class="section-title">Start free, scale as you grow</h2>
    <p class="section-subtitle mx-auto">Open source at the core. Premium features for teams that need more.</p>

    <div class="pricing-grid">
      <div class="price-card">
        <div class="price-tier">Free</div>
        <div class="price-amount"><span class="currency">$</span>0<span class="period">/mo</span></div>
        <p class="price-desc">For individual developers getting started with code memory.</p>
        <ul class="price-features">
          <li>50 proven patterns</li>
          <li>Local storage only</li>
          <li>CLI + MCP tools</li>
          <li>Covenant validation</li>
          <li>Community access (read)</li>
        </ul>
        <a href="https://github.com/remembrance-oracle/toolkit" class="price-btn price-btn-outline">Get Started Free</a>
      </div>

      <div class="price-card featured">
        <div class="price-tier">Pro</div>
        <div class="price-amount"><span class="currency">$</span>19<span class="period">/mo</span></div>
        <p class="price-desc">For developers and small teams who want full federation.</p>
        <ul class="price-features">
          <li>5,000 proven patterns</li>
          <li>10 team members</li>
          <li>Personal + community storage</li>
          <li>Federation hub</li>
          <li>Dashboard access</li>
          <li>Priority support</li>
        </ul>
        <a href="#waitlist" class="price-btn price-btn-filled">Join the Waitlist</a>
      </div>

      <div class="price-card">
        <div class="price-tier">Team</div>
        <div class="price-amount"><span class="currency">$</span>49<span class="period">/mo/member</span></div>
        <p class="price-desc">For organizations that need hosted infrastructure and SSO.</p>
        <ul class="price-features">
          <li>Unlimited patterns</li>
          <li>Unlimited members</li>
          <li>Hosted federation hub</li>
          <li>SSO / SAML</li>
          <li>Audit logs</li>
          <li>Dedicated support</li>
        </ul>
        <a href="#waitlist" class="price-btn price-btn-outline">Contact Us</a>
      </div>
    </div>
  </div>
</section>

<!-- ─── CTA ─── -->
<section id="waitlist" class="cta-section">
  <div class="container">
    <p class="section-label">Get Early Access</p>
    <h2>Start Building Your<br>Code Memory</h2>
    <p>Join the waitlist for Pro and Team plans. Free tier is available now.</p>

    <form class="waitlist-form" id="waitlistForm">
      <input type="email" name="email" placeholder="you@company.com" required autocomplete="email" />
      <button type="submit">Join Waitlist</button>
    </form>
    <p class="waitlist-msg" id="waitlistMsg"></p>

    <a href="https://github.com/remembrance-oracle/toolkit" class="cta-link">
      Or get started immediately on GitHub &rarr;
    </a>
  </div>
</section>

<!-- ─── Footer ─── -->
<footer>
  <div class="container">
    <div class="footer-inner">
      <div class="footer-brand">
        <strong>&gt; remembrance.oracle</strong>
      </div>
      <ul class="footer-links">
        <li><a href="https://github.com/remembrance-oracle/toolkit">GitHub</a></li>
        <li><a href="https://github.com/remembrance-oracle/toolkit#readme">Documentation</a></li>
        <li><a href="/dashboard">Dashboard</a></li>
        <li><a href="https://github.com/remembrance-oracle/toolkit#mcp-server">MCP Setup</a></li>
      </ul>
      <div class="footer-note">
        Built with zero dependencies. Powered by <code>Node.js</code>.
      </div>
    </div>
  </div>
</footer>

<!-- ─── Inline JavaScript ─── -->
<script>
(function() {
  'use strict';

  // ─── Animated Counters ───
  function animateCounters() {
    var counters = document.querySelectorAll('.stat-number[data-target]');
    var observed = new Set();

    function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

    function animateCounter(el) {
      var target = parseInt(el.getAttribute('data-target'), 10);
      if (isNaN(target)) return;
      var duration = 1800;
      var start = performance.now();

      function tick(now) {
        var elapsed = now - start;
        var progress = Math.min(elapsed / duration, 1);
        var value = Math.round(easeOutQuart(progress) * target);
        el.textContent = value.toLocaleString();
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && !observed.has(entry.target)) {
            observed.add(entry.target);
            animateCounter(entry.target);
          }
        });
      }, { threshold: 0.3 });

      counters.forEach(function(el) { observer.observe(el); });
    } else {
      counters.forEach(animateCounter);
    }
  }

  // ─── Live Stats Fetch ───
  function fetchStats() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/stats', true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          var counters = document.querySelectorAll('.stat-number[data-target]');
          if (data.totalPatterns && counters[0]) counters[0].setAttribute('data-target', data.totalPatterns);
          if (data.languages && counters[1]) counters[1].setAttribute('data-target', data.languages);
          if (data.communityPatterns && counters[2]) counters[2].setAttribute('data-target', data.communityPatterns);
        } catch(e) { /* use defaults */ }
      }
    };
    xhr.send();
  }

  // ─── Waitlist Form ───
  function setupWaitlist() {
    var form = document.getElementById('waitlistForm');
    var msg = document.getElementById('waitlistMsg');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var emailInput = form.querySelector('input[name="email"]');
      var btn = form.querySelector('button');
      var email = emailInput.value.trim();
      if (!email) return;

      btn.disabled = true;
      btn.textContent = 'Submitting...';
      msg.textContent = '';
      msg.className = 'waitlist-msg';

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/waitlist', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        btn.disabled = false;
        btn.textContent = 'Join Waitlist';
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.success) {
            msg.textContent = data.message || 'You are on the waitlist!';
            msg.className = 'waitlist-msg success';
            emailInput.value = '';
          } else {
            msg.textContent = data.error || 'Something went wrong.';
            msg.className = 'waitlist-msg error';
          }
        } catch(err) {
          msg.textContent = 'Something went wrong.';
          msg.className = 'waitlist-msg error';
        }
      };
      xhr.onerror = function() {
        btn.disabled = false;
        btn.textContent = 'Join Waitlist';
        msg.textContent = 'Network error. Please try again.';
        msg.className = 'waitlist-msg error';
      };
      xhr.send(JSON.stringify({ email: email }));
    });
  }

  // ─── Smooth Scroll ───
  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
      anchor.addEventListener('click', function(e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ─── Nav Shadow on Scroll ───
  function setupNavScroll() {
    var nav = document.querySelector('nav');
    if (!nav) return;
    window.addEventListener('scroll', function() {
      if (window.scrollY > 20) {
        nav.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
      } else {
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', function() {
    fetchStats();
    animateCounters();
    setupWaitlist();
    setupSmoothScroll();
    setupNavScroll();
  });
})();
</script>
</body>
</html>`;
}

// ─── Server ───

function createLandingServer(options = {}) {
  const port = options.port || 3000;
  const host = options.host || '0.0.0.0';

  // Try to load an oracle instance for live stats
  let oracle = options.oracle || null;
  if (!oracle) {
    try {
      const { RemembranceOracle } = require('../api/oracle');
      oracle = new RemembranceOracle({ autoSeed: false });
    } catch {
      oracle = null;
    }
  }

  const waitlist = new WaitlistStore();

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ─── Health Check ───
      if (pathname === '/health' && req.method === 'GET') {
        sendJSON(res, {
          status: 'healthy',
          service: 'landing',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
        return;
      }

      // ─── Public Stats ───
      if (pathname === '/api/stats' && req.method === 'GET') {
        const liveStats = oracle ? getOracleStats(oracle) : {};
        sendJSON(res, {
          totalPatterns: liveStats.totalPatterns || 655,
          languages: liveStats.languages || 5,
          communityPatterns: 346,
          mcpTools: 70,
          waitlistSize: waitlist.count(),
        });
        return;
      }

      // ─── Waitlist Signup ───
      if (pathname === '/api/waitlist' && req.method === 'POST') {
        readBody(req, (body) => {
          const result = waitlist.add(body.email, body.source || 'landing');
          const statusCode = result.success ? 200 : 400;
          sendJSON(res, result, statusCode);
        });
        return;
      }

      // ─── Landing Page ───
      if (pathname === '/' && req.method === 'GET') {
        const stats = oracle ? getOracleStats(oracle) : { totalPatterns: 655, languages: 5 };
        const html = generateHTML(stats);
        const buf = Buffer.from(html, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=300',
        });
        res.end(buf);
        return;
      }

      // ─── 404 ───
      sendJSON(res, { error: 'Not found' }, 404);

    } catch (err) {
      sendJSON(res, { error: 'Internal server error' }, 500);
    }
  });

  return {
    server,
    listen: (cb) => server.listen(port, host, cb),
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
    }),
    address: () => server.address(),
    waitlist,
  };
}

function startLanding(options = {}) {
  const port = options.port || 3000;
  const landing = createLandingServer(options);
  landing.server.listen(port, options.host || '0.0.0.0', () => {
    const addr = landing.server.address();
    const displayHost = addr.address === '0.0.0.0' ? 'localhost' : addr.address;
    console.log(`Remembrance Oracle landing page: http://${displayHost}:${addr.port}`);
  });
  return landing;
}

module.exports = { createLandingServer, startLanding };
