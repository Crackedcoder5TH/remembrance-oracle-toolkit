function getDashboardCSS() {
  return `
:root {
  --bg: #0f1019; --bg2: rgba(22,24,38,0.75); --bg3: #2a2d42;
  --bg-glass: rgba(22,24,38,0.55); --bg-glass-hover: rgba(34,37,58,0.7);
  --fg: #d1d5f0; --fg2: #a9b1d6; --fg3: #565f89; --fg4: #3d4466;
  --accent: #7aa2f7; --accent-dim: rgba(122,162,247,0.15);
  --green: #9ece6a; --green-dim: rgba(158,206,106,0.15);
  --red: #f7768e; --red-dim: rgba(247,118,142,0.15);
  --yellow: #e0af68; --yellow-dim: rgba(224,175,104,0.15);
  --purple: #bb9af7; --purple-dim: rgba(187,154,247,0.15);
  --cyan: #7dcfff; --cyan-dim: rgba(125,207,255,0.15);
  --orange: #ff9e64;
  --radius: 12px; --radius-sm: 8px; --radius-xs: 6px;
  --shadow: 0 8px 32px rgba(0,0,0,0.4);
  --glass-border: 1px solid rgba(255,255,255,0.06);
  --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --sidebar-w: 240px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--fg); display: flex;
  background-image: radial-gradient(ellipse at 20% 50%, rgba(122,162,247,0.06) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(187,154,247,0.04) 0%, transparent 50%);
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--fg4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--fg3); }

/* ─── Sidebar ─── */
.sidebar {
  width: var(--sidebar-w); height: 100vh; position: fixed; left: 0; top: 0; z-index: 50;
  background: var(--bg-glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-right: var(--glass-border); display: flex; flex-direction: column;
  transition: transform var(--transition); overflow: hidden;
}
.sidebar-header {
  padding: 20px 16px 12px; border-bottom: var(--glass-border);
}
.sidebar-logo {
  font-size: 0.85em; font-weight: 700; color: var(--accent); letter-spacing: -0.02em;
  display: flex; align-items: center; gap: 8px;
}
.sidebar-logo-icon {
  width: 28px; height: 28px; border-radius: var(--radius-xs);
  background: linear-gradient(135deg, var(--accent), var(--purple));
  display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff;
}
.sidebar-subtitle { font-size: 0.7em; color: var(--fg3); margin-top: 4px; }
.ws-dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-left: 6px;
  transition: background var(--transition);
}
.ws-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
.ws-dot.off { background: var(--red); }

.sidebar-nav { flex: 1; overflow-y: auto; padding: 8px 0; }
.nav-section { padding: 8px 16px 4px; font-size: 0.65em; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--fg4); font-weight: 600; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 16px; cursor: pointer;
  color: var(--fg3); font-size: 0.82em; font-weight: 500; transition: all var(--transition);
  border-left: 3px solid transparent; margin: 1px 0;
}
.nav-item:hover { color: var(--fg2); background: rgba(255,255,255,0.03); }
.nav-item.active {
  color: var(--accent); background: var(--accent-dim); border-left-color: var(--accent);
}
.nav-item .nav-icon { width: 18px; text-align: center; font-size: 0.95em; opacity: 0.8; }
.nav-item .nav-badge {
  margin-left: auto; font-size: 0.7em; padding: 1px 6px; border-radius: 10px;
  background: var(--accent-dim); color: var(--accent);
}

.sidebar-footer { padding: 12px 16px; border-top: var(--glass-border); font-size: 0.7em; color: var(--fg4); }

/* ─── Kbd shortcut hint ─── */
.kbd { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 0.75em;
  background: var(--bg3); color: var(--fg3); border: 1px solid var(--fg4); font-family: monospace; }

/* ─── Main ─── */
.main { margin-left: var(--sidebar-w); flex: 1; height: 100vh; overflow-y: auto; overflow-x: hidden; }
.main-inner { max-width: 1200px; margin: 0 auto; padding: 24px 32px 60px; }

/* ─── Header ─── */
.page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
.page-title { font-size: 1.3em; font-weight: 700; color: var(--fg); }
.page-desc { font-size: 0.82em; color: var(--fg3); margin-top: 2px; }

/* ─── Panels ─── */
.panel { display: none; animation: fadeUp 0.3s ease; }
.panel.active { display: block; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ─── Glass Card ─── */
.glass {
  background: var(--bg-glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: var(--glass-border); border-radius: var(--radius); box-shadow: var(--shadow);
}
.glass:hover { background: var(--bg-glass-hover); }

/* ─── Stats Grid ─── */
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card {
  padding: 16px 18px; border-radius: var(--radius); position: relative; overflow: hidden;
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(12px);
  transition: transform var(--transition), box-shadow var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--purple));
}
.stat-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg3); font-weight: 600; }
.stat-value { font-size: 1.7em; font-weight: 700; color: var(--accent); margin-top: 4px; }
.stat-sub { font-size: 0.72em; color: var(--fg3); margin-top: 2px; }

/* ─── Search Bars ─── */
.search-container { position: relative; margin-bottom: 16px; }
.search-row { display: flex; gap: 8px; }
.search-input {
  flex: 1; padding: 11px 16px 11px 38px;
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius-sm);
  color: var(--fg); font-family: inherit; font-size: 0.88em; backdrop-filter: blur(12px);
  transition: border-color var(--transition), box-shadow var(--transition); outline: none;
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.search-input::placeholder { color: var(--fg4); }
.search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  color: var(--fg4); font-size: 0.85em; pointer-events: none;
}
.search-select {
  padding: 10px 14px; background: var(--bg-glass); border: var(--glass-border);
  border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.85em;
  cursor: pointer; backdrop-filter: blur(12px); outline: none;
}
.search-select:focus { border-color: var(--accent); }
.search-select option { background: var(--bg); }
.search-hint { font-size: 0.72em; color: var(--fg4); margin-top: 6px; display: flex; align-items: center; gap: 6px; }

/* ─── Filter Bar ─── */
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filter-pill {
  padding: 5px 12px; border-radius: 20px; font-size: 0.78em; cursor: pointer;
  background: var(--bg3); color: var(--fg3); border: 1px solid transparent;
  transition: all var(--transition);
}
.filter-pill:hover { color: var(--fg2); background: var(--bg-glass-hover); }
.filter-pill.active { background: var(--accent-dim); color: var(--accent); border-color: rgba(122,162,247,0.3); }
.sort-btn {
  margin-left: auto; padding: 5px 12px; border-radius: 20px; font-size: 0.78em;
  cursor: pointer; background: var(--bg3); color: var(--fg3); border: none; font-family: inherit;
  transition: all var(--transition);
}
.sort-btn:hover { color: var(--fg2); }

/* ─── Code Card ─── */
.code-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  margin-bottom: 10px; overflow: hidden; transition: all var(--transition);
  border-left: 3px solid var(--fg4);
}
.code-card:hover { border-left-color: var(--accent); background: var(--bg-glass-hover); }
.code-card.expanded { border-left-color: var(--accent); }
.code-card-header {
  padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;
}
.code-card-expand { color: var(--fg4); font-size: 0.7em; transition: transform var(--transition); }
.code-card.expanded .code-card-expand { transform: rotate(90deg); }
.code-card-name { font-weight: 600; color: var(--fg); font-size: 0.9em; flex: 1; }
.code-card-lang {
  font-size: 0.72em; padding: 2px 8px; border-radius: 10px;
  background: var(--cyan-dim); color: var(--cyan); font-weight: 500;
}
.code-card-score {
  font-size: 0.78em; padding: 2px 10px; border-radius: 10px; font-weight: 600;
}
.score-high { background: var(--green-dim); color: var(--green); }
.score-mid { background: var(--yellow-dim); color: var(--yellow); }
.score-low { background: var(--red-dim); color: var(--red); }
.code-card-body { display: none; padding: 0 16px 14px; }
.code-card.expanded .code-card-body { display: block; animation: fadeUp 0.2s ease; }
.code-card-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.tag {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72em;
  background: var(--purple-dim); color: var(--purple); font-weight: 500;
}
.tag-type { background: var(--yellow-dim); color: var(--yellow); }
.tag-complexity { background: var(--cyan-dim); color: var(--cyan); }

/* ─── Code Block ─── */
pre.code-block {
  background: rgba(0,0,0,0.35); padding: 14px 16px; border-radius: var(--radius-sm);
  overflow-x: auto; font-size: 0.82em; line-height: 1.55; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  max-height: 350px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.04);
}
/* Syntax highlight classes */
.kw { color: var(--purple); } /* keywords */
.str { color: var(--green); } /* strings */
.num { color: var(--orange); } /* numbers */
.cm { color: var(--fg4); font-style: italic; } /* comments */
.fn { color: var(--accent); } /* functions */
.op { color: var(--cyan); } /* operators */

/* ─── Loading Skeleton ─── */
.skeleton { position: relative; overflow: hidden; background: var(--bg3); border-radius: var(--radius-sm); }
.skeleton::after {
  content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer { to { left: 100%; } }
.skel-card { height: 60px; margin-bottom: 10px; border-radius: var(--radius); }
.skel-stat { height: 80px; border-radius: var(--radius); }

/* ─── Toast ─── */
.toast-container { position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast-msg {
  padding: 10px 18px; border-radius: var(--radius-sm); font-size: 0.82em;
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(16px);
  color: var(--fg); box-shadow: var(--shadow);
  animation: toastIn 0.3s ease, toastOut 0.3s ease 2.7s forwards;
}
@keyframes toastIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes toastOut { to { opacity: 0; transform: translateX(30px); } }

/* ─── Empty / Info ─── */
.empty-state { text-align: center; color: var(--fg3); padding: 48px 20px; }
.empty-state .empty-icon { font-size: 2em; margin-bottom: 12px; opacity: 0.4; }
.empty-state .empty-text { font-size: 0.88em; }

/* ─── Bar Chart ─── */
.bar-row { display: flex; align-items: center; gap: 10px; margin: 5px 0; }
.bar-label { width: 120px; font-size: 0.78em; color: var(--fg2); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { flex: 1; height: 22px; background: rgba(255,255,255,0.03); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; min-width: 2px;
  background: linear-gradient(90deg, var(--accent), var(--purple)); }
.bar-fill.green { background: linear-gradient(90deg, var(--green), var(--cyan)); }
.bar-fill.yellow { background: linear-gradient(90deg, var(--yellow), var(--orange)); }
.bar-fill.red { background: linear-gradient(90deg, var(--red), var(--orange)); }
.bar-val { width: 60px; font-size: 0.78em; color: var(--fg3); }

/* ─── Donut Chart (CSS) ─── */
.donut-wrap { display: flex; align-items: center; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
.donut {
  width: 120px; height: 120px; border-radius: 50%; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.donut-center { font-size: 1.1em; font-weight: 700; color: var(--fg); position: relative; z-index: 1; }
.donut-legend { display: flex; flex-direction: column; gap: 6px; }
.donut-legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.78em; color: var(--fg2); }
.donut-swatch { width: 10px; height: 10px; border-radius: 2px; }

/* ─── Debug Card ─── */
.debug-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  padding: 14px 18px; margin-bottom: 10px; border-left: 3px solid var(--red);
}
.debug-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.debug-error { font-size: 0.85em; color: var(--red); font-weight: 600; flex: 1; word-break: break-word; }
.debug-confidence { font-size: 0.78em; padding: 2px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
.debug-meta { font-size: 0.75em; color: var(--fg3); margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }
.debug-category {
  padding: 2px 8px; border-radius: 10px; font-size: 0.72em; font-weight: 500;
  background: var(--orange); color: #000; display: inline-block;
}

/* ─── Teams ─── */
.team-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  padding: 16px 20px; margin-bottom: 10px; display: flex; align-items: center; gap: 16px;
  transition: all var(--transition);
}
.team-card:hover { background: var(--bg-glass-hover); }
.team-avatar {
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent), var(--purple));
  display: flex; align-items: center; justify-content: center; font-weight: 700;
  font-size: 1em; color: #fff; flex-shrink: 0;
}
.team-info { flex: 1; }
.team-name { font-weight: 600; font-size: 0.92em; color: var(--fg); }
.team-desc { font-size: 0.78em; color: var(--fg3); margin-top: 2px; }
.team-members { font-size: 0.78em; color: var(--fg3); }
.role-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 0.72em; font-weight: 600;
}
.role-admin { background: var(--red-dim); color: var(--red); }
.role-member { background: var(--green-dim); color: var(--green); }
.role-viewer { background: var(--cyan-dim); color: var(--cyan); }

/* ─── History Timeline ─── */
.timeline { position: relative; padding-left: 24px; }
.timeline::before {
  content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px;
  background: var(--fg4);
}
.timeline-item { position: relative; margin-bottom: 16px; }
.timeline-dot {
  position: absolute; left: -20px; top: 6px; width: 10px; height: 10px;
  border-radius: 50%; background: var(--accent); border: 2px solid var(--bg);
}
.timeline-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius-sm);
  padding: 12px 16px;
}
.timeline-date { font-size: 0.72em; color: var(--fg4); margin-bottom: 4px; }
.timeline-title { font-size: 0.88em; font-weight: 600; color: var(--fg); }
.timeline-detail { font-size: 0.78em; color: var(--fg3); margin-top: 4px; }

/* ─── Vector Scatter (CSS 3D-ish) ─── */
.scatter-container {
  width: 100%; height: 400px; position: relative;
  background: rgba(0,0,0,0.2); border-radius: var(--radius); border: var(--glass-border);
  overflow: hidden; perspective: 600px;
}
.scatter-point {
  position: absolute; border-radius: 50%; cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.scatter-point:hover {
  transform: scale(1.8) !important; z-index: 10;
  box-shadow: 0 0 12px currentColor;
}
.scatter-label {
  position: absolute; font-size: 0.68em; color: var(--fg3); white-space: nowrap;
  pointer-events: none;
}
.scatter-axis { position: absolute; font-size: 0.65em; color: var(--fg4); text-transform: uppercase; letter-spacing: 0.05em; }

/* ─── Admin ─── */
.admin-section { margin-bottom: 24px; }
.admin-section-title { font-size: 0.92em; font-weight: 600; color: var(--accent); margin-bottom: 12px; }
.admin-table {
  width: 100%; border-collapse: collapse; font-size: 0.82em;
}
.admin-table th {
  text-align: left; padding: 8px 12px; color: var(--fg3); font-weight: 600;
  border-bottom: 1px solid var(--fg4); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em;
}
.admin-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--fg2); }
.admin-table tr:hover td { background: rgba(255,255,255,0.02); }

.btn {
  padding: 8px 16px; border-radius: var(--radius-sm); font-family: inherit; font-size: 0.82em;
  font-weight: 600; cursor: pointer; border: none; transition: all var(--transition);
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #5b8bf5; box-shadow: 0 4px 12px rgba(122,162,247,0.3); }
.btn-ghost { background: transparent; color: var(--fg3); border: 1px solid var(--fg4); }
.btn-ghost:hover { color: var(--fg2); border-color: var(--fg3); }
.btn-sm { padding: 4px 10px; font-size: 0.75em; }

.input-field {
  padding: 8px 14px; background: var(--bg-glass); border: var(--glass-border);
  border-radius: var(--radius-xs); color: var(--fg); font-family: inherit; font-size: 0.85em;
  outline: none; transition: border-color var(--transition);
}
.input-field:focus { border-color: var(--accent); }
.input-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }

/* ─── Modal overlay for Ctrl+K ─── */
.cmd-palette {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: none;
  align-items: flex-start; justify-content: center; padding-top: 15vh;
}
.cmd-palette.open { display: flex; animation: fadeUp 0.15s ease; }
.cmd-palette-box {
  width: 480px; max-width: 90vw; background: var(--bg2); border: var(--glass-border);
  border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
}
.cmd-palette-input {
  width: 100%; padding: 14px 18px; background: transparent; border: none; border-bottom: var(--glass-border);
  color: var(--fg); font-family: inherit; font-size: 0.95em; outline: none;
}
.cmd-palette-input::placeholder { color: var(--fg4); }

/* ─── Mobile ─── */
.mobile-toggle {
  display: none; position: fixed; top: 12px; left: 12px; z-index: 60;
  width: 36px; height: 36px; border-radius: var(--radius-xs);
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(12px);
  color: var(--fg); font-size: 1.1em; cursor: pointer; align-items: center; justify-content: center;
}
@media (max-width: 768px) {
  .mobile-toggle { display: flex; }
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .main-inner { padding: 16px; padding-top: 56px; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
}

/* ─── Health Indicator ─── */
.health-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.health-good { background: var(--green); box-shadow: 0 0 6px var(--green); }
.health-warn { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); }
.health-bad { background: var(--red); box-shadow: 0 0 6px var(--red); }
`;
}

module.exports = { getDashboardCSS };
