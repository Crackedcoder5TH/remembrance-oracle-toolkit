'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  FRACTAL_DIM,
  toFractalWaveform,
  inspectFractalWaveform,
  fractalCoherency,
  fractalCoherencyOf,
} = require('../src/index');

const richCode = `
'use strict';
const fs = require('fs');
const path = require('path');

function buildIndex(root) {
  const out = new Map();
  for (const file of fs.readdirSync(root)) {
    const full = path.join(root, file);
    if (fs.statSync(full).isFile()) out.set(file, fs.readFileSync(full, 'utf8'));
  }
  return out;
}

async function main() {
  try {
    const idx = buildIndex(process.argv[2] || '.');
    for (const [k, v] of idx) if (v.length > 100) console.log(k, v.length);
  } catch (e) { console.error(e); process.exit(1); }
}

main();
`;

const otherRichCode = `
const http = require('http');
async function startServer(port) {
  const srv = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') return res.writeHead(405).end();
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: parsed }));
    } catch (err) { res.writeHead(500).end(String(err)); }
  });
  srv.listen(port);
  return srv;
}
module.exports = { startServer };
`;

const prose = (
  'The Remembrance Field is a shared conserved scalar that any caller may contribute to. ' +
  'Contributions are best-effort: a slow or unreachable server never throws — the caller ' +
  'gets a result object instead. Reads are open; writes require a bearer token when one is set. ' +
  'The math is intentionally simple, so the same contract is easy to mirror across languages.'
).repeat(8);

test('fractal waveform has the documented 29 dimensions', () => {
  const wf = toFractalWaveform(richCode);
  assert.strictEqual(FRACTAL_DIM, 29);
  assert.strictEqual(wf.length, 29);
  for (const v of wf) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `dim out of [0,1]: ${v}`);
});

test('empty input → all zeros', () => {
  const wf = toFractalWaveform('');
  assert.strictEqual(wf.length, 29);
  assert.ok(wf.every((v) => v === 0));
});

test('self-coherency is 1.0 (within fp precision) for any non-empty input', () => {
  for (const text of [richCode, otherRichCode, prose, 'short snippet']) {
    assert.ok(Math.abs(fractalCoherencyOf(text, text) - 1) < 1e-12,
      `self-coherency should be 1.0 for ${JSON.stringify(text.slice(0, 30))}`);
  }
});

test('rich code scores much higher against rich code than against prose', () => {
  const codeVsCode = fractalCoherencyOf(richCode, otherRichCode);
  const codeVsProse = fractalCoherencyOf(richCode, prose);
  // The whole point: byte-stretch had codeVsProse ≈ codeVsCode. Fractal must separate them.
  assert.ok(codeVsCode > codeVsProse + 0.2,
    `expected a >=0.2 spread between code-vs-code (${codeVsCode}) and code-vs-prose (${codeVsProse})`);
});

test('structurality is high for code, low for prose', () => {
  const code = inspectFractalWaveform(richCode);
  const text = inspectFractalWaveform(prose);
  assert.ok(code.structurality > 0.5, `code structurality should be > 0.5, got ${code.structurality}`);
  assert.ok(text.structurality < 0.3,  `prose structurality should be < 0.3, got ${text.structurality}`);
});

test('non-code input produces a degenerate atomic signature (no imports, no I/O)', () => {
  const text = inspectFractalWaveform(prose);
  // valence (imports / 8) and reactivity (I/O bucket) should be zero on pure prose.
  assert.strictEqual(text.atomic.valence, 0);
  assert.strictEqual(text.atomic.reactivity, 0);
});

test('encoder is deterministic — same input, same vector', () => {
  const a = toFractalWaveform(richCode);
  const b = toFractalWaveform(richCode);
  for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i]);
});

test('fractalCoherency gate preserves identity even for low-structurality input', () => {
  // Identity must be 1.0 — the structurality-agreement gate is 1 when Δ=0.
  // Tolerance handles fp rounding in the cosine numerator/denominator.
  assert.ok(Math.abs(fractalCoherencyOf(prose, prose) - 1) < 1e-12);
});
