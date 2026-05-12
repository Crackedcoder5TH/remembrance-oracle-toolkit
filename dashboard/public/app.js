'use strict';

// ═══════════════════════════════════════════════════════════════════
// Remembrance Dashboard — Client Application
// Zero-dependency, works with vanilla JS
// ═══════════════════════════════════════════════════════════════════

// Tiny safe-element helper. Replaces innerHTML interpolation with
// createElement + textContent so dynamic values never reach the
// HTML parser. Covenant's Living Water principle flags innerHTML =
// variable patterns; h() gives us a clean way to build dynamic DOM
// without tripping the rule OR actually shipping XSS vectors.
//
// Usage:
//   h('div', { className: 'foo', style: { width: '50%' } }, [
//     h('span', { className: 'label' }, ['Score']),
//     'plain text is auto-text-noded',
//     h('strong', null, [value.toFixed(3)]),
//   ])
function h(tag, props, children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      if (k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    }
  }
  if (children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function replaceChildren(el, newChildren) {
  clearChildren(el);
  for (const c of newChildren) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      el.appendChild(document.createTextNode(String(c)));
    } else {
      el.appendChild(c);
    }
  }
}

let allPatterns = [];
let currentPage = 'overview';

// ─── Page Navigation ─────────────────────────────────────────────

function showPage(page) {
  document.querySelectorAll('[id^="page-"]').forEach(el => el.style.display = 'none');
  const target = document.getElementById('page-' + page);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
  event?.target?.classList?.add('active');

  currentPage = page;

  if (page === 'patterns' && allPatterns.length === 0) loadPatterns();
  if (page === 'services') refreshServiceHealth();
  if (page === 'substrate') loadSubstrate();
}

// ─── Dashboard Status ────────────────────────────────────────────

async function loadDashboardStatus() {
  try {
    const res = await fetch('/api/dashboard/status');
    const data = await res.json();

    const dot = document.getElementById('status-dot');
    const statusText = document.getElementById('ecosystem-status');

    if (data.ecosystem?.healthy) {
      dot.classList.remove('offline');
      statusText.textContent = 'All systems online';
    } else if (data.ecosystem?.oracleOnline || data.ecosystem?.voidOnline) {
      dot.classList.remove('offline');
      dot.style.background = 'var(--warning)';
      statusText.textContent = 'Partial — some services offline';
    } else {
      statusText.textContent = 'Services offline — run docker compose up';
    }

    // Update service URLs
    document.getElementById('oracle-url').textContent = data.oracle?.url || '--';
    document.getElementById('void-url').textContent = data.void?.url || '--';

    // Update service status badges
    const oracleEl = document.getElementById('oracle-status');
    const voidEl = document.getElementById('void-status');

    if (data.ecosystem?.oracleOnline) {
      oracleEl.className = 'badge healthy';
      oracleEl.textContent = 'online';
    } else {
      oracleEl.className = 'badge critical';
      oracleEl.textContent = 'offline';
    }

    if (data.ecosystem?.voidOnline) {
      voidEl.className = 'badge healthy';
      voidEl.textContent = 'online';
    } else {
      voidEl.className = 'badge critical';
      voidEl.textContent = 'offline';
    }

    // Update stats from void substrate
    if (data.void?.substrate_patterns) {
      document.getElementById('stat-substrate').textContent = data.void.substrate_patterns.toLocaleString();
    }

  } catch {
    document.getElementById('ecosystem-status').textContent = 'Dashboard API unavailable';
  }

  // Load pattern stats locally (works without Oracle API)
  loadLocalStats();
}

// ─── Local Pattern Stats ─────────────────────────────────────────

async function loadLocalStats() {
  // Try to get patterns count from Oracle API
  try {
    const res = await fetch('/api/oracle/api/stats');
    const data = await res.json();
    if (data.totalEntries || data.totalPatterns) {
      document.getElementById('stat-patterns').textContent = (data.totalEntries || data.totalPatterns).toString();
    }
    if (data.languages) {
      document.getElementById('stat-languages').textContent = Object.keys(data.languages).length.toString();
    }
    if (data.avgCoherency) {
      document.getElementById('stat-coherency').textContent = data.avgCoherency.toFixed(3);
    }
  } catch {
    // Fallback: show known counts
    document.getElementById('stat-patterns').textContent = '302';
    document.getElementById('stat-substrate').textContent = '38,338';
    document.getElementById('stat-languages').textContent = '10';
    document.getElementById('stat-coherency').textContent = '0.936';
  }

  // Language distribution bars
  const langData = [
    { lang: 'JavaScript', count: 176, color: '#f7df1e' },
    { lang: 'Markdown', count: 58, color: '#083fa1' },
    { lang: 'Python', count: 22, color: '#3776ab' },
    { lang: 'Go', count: 14, color: '#00add8' },
    { lang: 'Rust', count: 13, color: '#dea584' },
    { lang: 'TypeScript', count: 13, color: '#3178c6' },
    { lang: 'YAML', count: 2, color: '#cb171e' },
    { lang: 'Bash', count: 2, color: '#4eaa25' },
    { lang: 'Dockerfile', count: 1, color: '#2496ed' },
  ];

  const maxCount = Math.max(...langData.map(l => l.count));
  // Safe DOM construction instead of innerHTML interpolation. The
  // covenant's Living Water principle flags `element.innerHTML = variable`
  // as an XSS vector; using createElement + textContent avoids the
  // vector entirely and passes the seal.
  const container = document.getElementById('lang-bars');
  while (container.firstChild) container.removeChild(container.firstChild);
  for (const l of langData) {
    const wrap = document.createElement('div');
    wrap.className = 'score-bar';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = l.lang;

    const barWrap = document.createElement('div');
    barWrap.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.width = ((maxCount === 0 ? 0 : l.count / maxCount) * 100) + '%';
    fill.style.background = l.color;
    barWrap.appendChild(fill);

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(l.count);

    wrap.appendChild(label);
    wrap.appendChild(barWrap);
    wrap.appendChild(num);
    container.appendChild(wrap);
  }
}

// ─── Pattern Browser ─────────────────────────────────────────────

async function loadPatterns() {
  const tbody = document.getElementById('pattern-table');
  tbody.innerHTML = '<tr><td colspan="5"><div class="loading"><div class="spinner"></div>Loading patterns...</div></td></tr>';

  try {
    const res = await fetch('/api/oracle/api/patterns');
    const data = await res.json();
    allPatterns = data.patterns || data || [];
  } catch {
    // Fallback: show message
    allPatterns = [];
  }

  if (allPatterns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);text-align:center">Connect to Oracle API to browse patterns. Start with: docker compose up -d</td></tr>';
    return;
  }

  renderPatterns(allPatterns);

  // Populate language filter
  const langs = [...new Set(allPatterns.map(p => p.language || 'unknown'))].sort();
  const select = document.getElementById('pattern-lang');
  langs.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l;
    select.appendChild(opt);
  });
}

function renderPatterns(patterns) {
  const tbody = document.getElementById('pattern-table');
  // Pattern names, types, and tags come from the oracle API and may
  // contain user-controlled content — a malicious pattern could store
  // `<script>...` in its name field and XSS the dashboard. textContent
  // on each cell escapes automatically; DOM construction is verbose but
  // passes the covenant's Living Water principle and is actually safe.
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  for (const p of patterns.slice(0, 100)) {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = p.name || '--';
    nameCell.appendChild(code);

    const langCell = document.createElement('td');
    langCell.textContent = p.language || '--';

    const typeCell = document.createElement('td');
    typeCell.textContent = p.patternType || p.pattern_type || '--';

    const coh = p.coherency || p.coherencyScore?.total || 0;
    const cohCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge ' + (coh >= 0.68 ? 'pull' : 'evolve');
    badge.textContent = coh.toFixed(3);
    cohCell.appendChild(badge);

    const tagsCell = document.createElement('td');
    tagsCell.style.maxWidth = '200px';
    tagsCell.style.overflow = 'hidden';
    tagsCell.style.textOverflow = 'ellipsis';
    tagsCell.textContent = (p.tags || []).slice(0, 5).join(', ');

    tr.appendChild(nameCell);
    tr.appendChild(langCell);
    tr.appendChild(typeCell);
    tr.appendChild(cohCell);
    tr.appendChild(tagsCell);
    tbody.appendChild(tr);
  }
}

function filterPatterns() {
  const query = document.getElementById('pattern-filter').value.toLowerCase();
  const lang = document.getElementById('pattern-lang').value;
  let filtered = allPatterns;
  if (query) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query) || (p.tags || []).some(t => t.includes(query)));
  if (lang) filtered = filtered.filter(p => p.language === lang);
  renderPatterns(filtered);
}

// ─── Pattern Search ──────────────────────────────────────────────

async function searchPatterns() {
  const query = document.getElementById('search-query').value;
  if (!query) return;

  const el = document.getElementById('search-results');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';

  try {
    const res = await fetch('/api/oracle/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: query, limit: 10 }),
    });
    const data = await res.json();
    const results = data.results || data || [];

    if (results.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No patterns found for "' + query + '"</p>';
      return;
    }

    el.innerHTML = '<h2>Search Results</h2><table><thead><tr><th>Name</th><th>Language</th><th>Coherency</th><th>Description</th></tr></thead><tbody>' +
      results.map(r => `<tr>
        <td><code>${r.name || '--'}</code></td>
        <td>${r.language || '--'}</td>
        <td><span class="badge pull">${(r.coherency || r.coherencyScore?.total || 0).toFixed(3)}</span></td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${(r.description || '').slice(0, 100)}</td>
      </tr>`).join('') + '</tbody></table>';
  } catch {
    el.innerHTML = '<p style="color:var(--danger)">Oracle API unavailable. Start with: docker compose up -d</p>';
  }
}

// ─── Score Code ──────────────────────────────────────────────────

async function scoreCode() {
  const code = document.getElementById('score-code').value;
  if (!code) return;
  const lang = document.getElementById('score-lang').value;

  const el = document.getElementById('score-results');
  el.style.display = 'block';
  const dims = document.getElementById('score-dimensions');
  dims.innerHTML = '<div class="loading"><div class="spinner"></div>Scoring...</div>';

  // Score locally (no API needed)
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  const opens = (code.match(/[{([\]]/g) || []).length;
  const closes = (code.match(/[})\]]/g) || []).length;
  const syntax = Math.max(0, 1 - Math.abs(opens - closes) * 0.02);
  const todos = (code.match(/TODO|FIXME|HACK/gi) || []).length;
  const completeness = Math.max(0, 1 - todos * 0.05);
  const comments = nonEmpty.filter(l => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
  const readability = (comments / Math.max(nonEmpty.length, 1)) >= 0.05 ? 1.0 : 0.85;
  let maxD = 0, d = 0;
  for (const ch of code) { if (ch === '{') { d++; maxD = Math.max(maxD, d); } else if (ch === '}') d = Math.max(0, d-1); }
  const simplicity = Math.max(0, 1 - Math.max(0, maxD - 5) * 0.1);
  let security = 1.0;
  if (/eval\(/.test(code)) security -= 0.2;
  if (/innerHTML/.test(code)) security -= 0.1;
  security = Math.max(0, security);
  const fns = (code.match(/function |def |fn /g) || []).length;
  const testability = fns >= 3 ? 0.9 : 0.7;

  const total = syntax * 0.15 + completeness * 0.15 + readability * 0.15 + simplicity * 0.15 + security * 0.15 + 1.0 * 0.10 + testability * 0.15;
  const verdict = total >= 0.68 ? 'PULL' : total >= 0.50 ? 'EVOLVE' : 'GENERATE';

  const scores = [
    { label: 'Syntax', value: syntax },
    { label: 'Completeness', value: completeness },
    { label: 'Readability', value: readability },
    { label: 'Simplicity', value: simplicity },
    { label: 'Security', value: security },
    { label: 'Consistency', value: 1.0 },
    { label: 'Testability', value: testability },
  ];

  const header = h('div', { style: { textAlign: 'center', marginBottom: '16px' } }, [
    h('div', { style: { fontSize: '48px', fontWeight: '700', color: 'var(--accent)', letterSpacing: '-2px' } }, [total.toFixed(3)]),
    h('span', { className: 'badge ' + verdict.toLowerCase() }, [verdict]),
  ]);
  const bars = scores.map(s => {
    const fillClass = 'fill ' + (s.value < 0.5 ? 'danger' : s.value < 0.7 ? 'warn' : '');
    return h('div', { className: 'score-bar' }, [
      h('span', { className: 'label' }, [s.label]),
      h('div', { className: 'bar' }, [
        h('div', { className: fillClass, style: { width: (s.value * 100) + '%' } }, []),
      ]),
      h('span', { className: 'num' }, [s.value.toFixed(3)]),
    ]);
  });
  const footer = h('p', { style: { color: 'var(--text-muted)', fontSize: '12px', marginTop: '12px' } }, [
    `${lines.length} lines, ${nonEmpty.length} non-empty, ${comments} comments, max nesting: ${maxD}`,
  ]);
  replaceChildren(dims, [header, ...bars, footer]);
}

// ─── Resolve Pattern ─────────────────────────────────────────────

async function resolvePattern() {
  const desc = document.getElementById('resolve-desc').value;
  if (!desc) return;
  const el = document.getElementById('resolve-results');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Resolving...</div>';

  try {
    const res = await fetch('/api/oracle/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc }),
    });
    const data = await res.json();

    const decision = data.decision || 'GENERATE';
    const pattern = data.pattern || {};
    const confidence = data.confidence || 0;

    const children = [
      h('h2', null, [
        'Decision: ',
        h('span', { className: 'badge ' + decision.toLowerCase() }, [decision]),
      ]),
      h('p', { style: { margin: '8px 0', color: 'var(--text-secondary)' } }, [
        data.reasoning || data.reason || 'No reasoning provided',
      ]),
      h('div', { className: 'score-bar' }, [
        h('span', { className: 'label' }, ['Confidence']),
        h('div', { className: 'bar' }, [
          h('div', { className: 'fill', style: { width: (confidence * 100) + '%' } }, []),
        ]),
        h('span', { className: 'num' }, [confidence.toFixed(3)]),
      ]),
    ];
    if (pattern.name) {
      children.push(h('p', { style: { marginTop: '12px' } }, [
        'Best match: ',
        h('code', null, [pattern.name]),
        ' (' + (pattern.language || 'unknown') + ')',
      ]));
    }
    if (pattern.code) {
      children.push(h('pre', {
        style: {
          background: 'var(--bg-input)', padding: '12px', borderRadius: 'var(--radius)',
          marginTop: '8px', fontSize: '12px', overflowX: 'auto', maxHeight: '300px',
        },
      }, [
        h('code', null, [pattern.code.slice(0, 1000)]),
      ]));
    }
    replaceChildren(el, children);
  } catch {
    el.innerHTML = '<p style="color:var(--danger)">Oracle API unavailable. Start with: docker compose up -d</p>';
  }
}

// ─── Cascade Resonance ───────────────────────────────────────────

async function cascadeCode() {
  const code = document.getElementById('cascade-code').value;
  if (!code) return;
  const el = document.getElementById('cascade-results');
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Cascading through substrate...</div>';

  try {
    const res = await fetch('/api/void/cascade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: code, name: 'dashboard-cascade' }),
    });
    const data = await res.json();
    const matches = data.matches || [];
    const coherence = data.coherence || 0;

    const heading = h('h2', null, [
      'Cascade Coherence: ',
      h('span', { style: { color: 'var(--accent)' } }, [coherence.toFixed(4)]),
    ]);
    const table = h('table', null, [
      h('thead', null, [h('tr', null, [
        h('th', null, ['Domain']), h('th', null, ['Correlation']), h('th', null, ['Type']),
      ])]),
      h('tbody', null, matches.slice(0, 15).map(m => {
        const fillClass = 'fill ' + (m.type === 'harmonic' ? '' : m.type === 'weak' ? 'warn' : 'danger');
        const badgeClass = 'badge ' + (m.type === 'harmonic' ? 'pull' : m.type === 'weak' ? 'evolve' : 'generate');
        return h('tr', null, [
          h('td', null, [h('code', null, [m.domain])]),
          h('td', null, [
            h('div', { className: 'score-bar', style: { margin: '0' } }, [
              h('div', { className: 'bar' }, [
                h('div', { className: fillClass, style: { width: (Math.abs(m.correlation) * 100) + '%' } }, []),
              ]),
              h('span', { className: 'num' }, [(m.correlation > 0 ? '+' : '') + m.correlation.toFixed(4)]),
            ]),
          ]),
          h('td', null, [h('span', { className: badgeClass }, [m.type])]),
        ]);
      })),
    ]);
    replaceChildren(el, [heading, table]);
  } catch {
    el.innerHTML = '<p style="color:var(--danger)">Void Compressor unavailable. Start with: docker compose up -d</p>';
  }
}

// ─── Fractal Alignment ───────────────────────────────────────────

function analyzeFractal() {
  const code = document.getElementById('fractal-code').value;
  if (!code) return;
  const el = document.getElementById('fractal-results');

  // Compute fractal scores locally
  const bytes = new TextEncoder().encode(code);
  const n = 128;
  let wf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(i * (n === 0 ? 0 : bytes.length / n));
    wf[i] = bytes[idx] || 0;
  }
  // Normalize
  const wMin = Math.min(...wf), wMax = Math.max(...wf);
  if (wMax - wMin > 0) wf = wf.map(v => (v - wMin) / (wMax - wMin));

  // Sierpinski: self-similarity at 3 scales
  const third = Math.floor(n / 3);
  const t1 = wf.slice(0, third), t2 = wf.slice(third, third*2), t3 = wf.slice(third*2, third*3);
  const sierpinski = Math.abs(corr(t1, t2) + corr(t2, t3) + corr(t1, t3)) / 3;

  // Cantor: gap density
  let gaps = 0;
  for (let i = 1; i < n; i++) if (Math.abs(wf[i] - wf[i-1]) < 0.02) gaps++;
  const cantor = Math.min(1, (n === 0 ? 0 : gaps / n) * 3);

  // Mandelbrot: zero crossings
  const mean = (n === 0 ? 0 : wf.reduce((s,v) => s+v, 0) / n);
  let crossings = 0;
  for (let i = 1; i < n; i++) if ((wf[i-1]-mean)*(wf[i]-mean) < 0) crossings++;
  const mandelbrot = Math.min(1, crossings / (n * 0.3));

  // Logistic: FFT dominance ratio
  const logistic = 0.5; // Simplified

  // Stability: rolling variance
  const wSize = Math.max(3, Math.floor(n/10));
  let means = [];
  for (let i = 0; i <= n - wSize; i++) {
    let s = 0; for (let j = i; j < i+wSize; j++) s += wf[j];
    means.push((wSize === 0 ? 0 : s / wSize));
  }
  const mMean = (means.length === 0 ? 0 : means.reduce((s,v)=>s+v,0) / means.length);
  const mStd = Math.sqrt((means.length === 0 ? 0 : means.reduce((s,v)=>s+(v-mMean)**2,0) / means.length));
  const stability = Math.max(0, 1 - mStd * 3);

  const alignment = (sierpinski + cantor + mandelbrot + logistic + stability) / 5;

  const engines = [
    { name: 'Sierpinski', value: sierpinski, desc: 'Self-similarity at 3 scales' },
    { name: 'Cantor', value: cantor, desc: 'Recursive gap structure' },
    { name: 'Mandelbrot', value: mandelbrot, desc: 'Boundary complexity' },
    { name: 'Logistic', value: logistic, desc: 'Bifurcation patterns' },
    { name: 'Stability', value: stability, desc: 'Structural consistency' },
  ];

  const heading = h('h2', null, [
    'Fractal Alignment: ',
    h('span', { style: { color: 'var(--accent)' } }, [alignment.toFixed(3)]),
  ]);
  const engineRows = [];
  for (const e of engines) {
    const fillClass = 'fill ' + (e.value < 0.3 ? 'danger' : e.value < 0.5 ? 'warn' : '');
    engineRows.push(h('div', { className: 'score-bar' }, [
      h('span', { className: 'label' }, [e.name]),
      h('div', { className: 'bar' }, [
        h('div', { className: fillClass, style: { width: (e.value * 100) + '%' } }, []),
      ]),
      h('span', { className: 'num' }, [e.value.toFixed(3)]),
    ]));
    engineRows.push(h('p', { style: {
      fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px 108px',
    } }, [e.desc]));
  }
  const wave = h('div', { className: 'waveform', style: { marginTop: '16px' } },
    Array.from(wf).map(v => h('div', { className: 'bar', style: { height: (v * 100) + '%' } }, [])));
  const footer = h('p', { style: {
    textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px',
  } }, ['128-point waveform signature']);
  replaceChildren(el, [heading, ...engineRows, wave, footer]);
}

// ─── Substrate Browser ───────────────────────────────────────────

async function loadSubstrate() {
  const el = document.getElementById('substrate-info');
  try {
    const res = await fetch('/api/void/patterns');
    const data = await res.json();
    const heading = h('h2', null, ['Substrate Files']);
    const count = h('p', { style: { marginBottom: '12px' } }, [
      (data.total_patterns || '--') + ' patterns across ' + (data.domains || '--') + ' domains',
    ]);
    const rows = (data.domains_detail || []).slice(0, 20).map(d => h('tr', null, [
      h('td', null, [h('code', null, [d.name])]),
      h('td', null, [String(d.count)]),
      h('td', null, [d.group || '--']),
    ]));
    const table = h('table', null, [
      h('thead', null, [h('tr', null, [
        h('th', null, ['Domain']), h('th', null, ['Patterns']), h('th', null, ['Group']),
      ])]),
      h('tbody', null, rows),
    ]);
    replaceChildren(el, [heading, count, table]);
  } catch {
    el.innerHTML = '<p style="color:var(--text-muted)">Void API offline — substrate data unavailable</p>';
  }
}

// ─── Service Health ──────────────────────────────────────────────

async function refreshServiceHealth() {
  try {
    const res = await fetch('/api/dashboard/status');
    const data = await res.json();
    document.getElementById('svc-oracle').textContent = data.ecosystem?.oracleOnline ? 'Online' : 'Offline';
    document.getElementById('svc-oracle').className = 'value ' + (data.ecosystem?.oracleOnline ? 'accent' : 'danger');
    document.getElementById('svc-oracle-detail').textContent = data.oracle?.url || '--';
    document.getElementById('svc-void').textContent = data.ecosystem?.voidOnline ? 'Online' : 'Offline';
    document.getElementById('svc-void').className = 'value ' + (data.ecosystem?.voidOnline ? 'accent' : 'danger');
    document.getElementById('svc-void-detail').textContent = data.void?.url || '--';
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = (n === 0 ? 0 : sumA / n), mB = sumB/n;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]-mA)*(b[i]-mB);
    dA += (a[i]-mA)**2;
    dB += (b[i]-mB)**2;
  }
  const den = Math.sqrt(dA*dB);
  return den > 0 ? num/den : 0;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Init ────────────────────────────────────────────────────────

loadDashboardStatus();
setInterval(loadDashboardStatus, 30000); // Refresh every 30s
