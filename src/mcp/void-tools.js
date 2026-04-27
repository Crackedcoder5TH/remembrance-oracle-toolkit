'use strict';

/**
 * MCP void_* tool family.
 *
 * Exposes Void-Data-Compressor primitives (compression, resonance,
 * pattern lookup, ecosystem health) over the same MCP server that
 * already handles oracle_*. Each tool spawns a one-shot python3
 * subprocess against the void repo's modules; results are JSON.
 *
 * Resolution order for the void repo:
 *   1. $VOID_REPO env var
 *   2. ../Void-Data-Compressor (sibling)
 *   3. ../void-data-compressor
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FALLBACKS = [
  path.resolve(__dirname, '../../../Void-Data-Compressor'),
  path.resolve(__dirname, '../../../void-data-compressor'),
];

function _resolveVoidRepo() {
  if (process.env.VOID_REPO && fs.existsSync(process.env.VOID_REPO)) {
    return process.env.VOID_REPO;
  }
  for (const p of FALLBACKS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'void_*: Void-Data-Compressor not found. Set VOID_REPO or place it as a sibling repo.'
  );
}

function _runPython(scriptBody, cwd) {
  // Run a python3 -c snippet, return stdout as string. The snippet
  // should print one JSON line — that's what we parse.
  const r = spawnSync('python3', ['-c', scriptBody], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, // 64 MB cap
    env: { ...process.env, PYTHONPATH: cwd },
  });
  if (r.status !== 0) {
    throw new Error(`python3 failed (${r.status}): ${r.stderr || r.stdout}`);
  }
  // Find the last non-empty JSON line in stdout (init prints come first)
  const lines = r.stdout.split('\n').filter(l => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') || line.startsWith('[')) {
      try { return JSON.parse(line); } catch { /* keep looking */ }
    }
  }
  throw new Error(`no JSON output from python: ${r.stdout.slice(0, 200)}`);
}

// ─── Tool definitions ────────────────────────────────────────────

const VOID_TOOLS = [
  {
    name: 'void_compress',
    description: 'Run the void compressor on a UTF-8 string. Returns compression ratio, avg coherence, num chunks, and method. The input is hashed and compressed; lossless decompression is verified.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'UTF-8 string to compress (any size up to a few MB).' },
      },
      required: ['input'],
    },
  },
  {
    name: 'void_resonance',
    description: 'Run the resonance detector and return the top cross-domain resonances. Uses pattern_store.npz — every domain signature (~675) is computed from the unified canonical store. Returns top-N by combined_score.',
    inputSchema: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'How many resonances to return (default 10).' },
        domain: { type: 'string', description: 'Optional: restrict results to ones involving this domain name.' },
      },
    },
  },
  {
    name: 'void_pattern_match',
    description: 'Find the best-matching patterns for an input string. Compresses the input, then returns the L1 patterns that the blend search picked, with their URIs and contributions.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'UTF-8 input to match.' },
        top: { type: 'number', description: 'How many top matches to return (default 5).' },
      },
      required: ['input'],
    },
  },
  {
    name: 'void_uri_lookup',
    description: 'Resolve a coh:// URI to its pattern in the canonical store. Returns the pattern\'s name, domain, source repo, and waveform stats. Both exact (#h: pinned) and base (@v1) URIs work.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'coh:// URI to look up.' },
      },
      required: ['uri'],
    },
  },
  {
    name: 'void_ecosystem',
    description: 'Single-shot ecosystem health: pattern count by repo, total URIs, mean coherency_v1.unified, top resonance partners, and the fraction of records carrying provenance edges.',
    inputSchema: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include per-repo breakdown (default true).' },
      },
    },
  },
];

// ─── Handlers ───────────────────────────────────────────────────

const VOID_HANDLERS = {
  void_compress(_oracle, args) {
    const cwd = _resolveVoidRepo();
    const input = args.input;
    if (typeof input !== 'string' || input.length === 0) {
      throw new Error('input must be non-empty string');
    }
    const escaped = JSON.stringify(input);
    const script = `
import json, io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from void_compressor_v4 import FractalVoidCompressor
    c = FractalVoidCompressor()
data = (${escaped}).encode('utf-8')
res = c.compress(data)
restored = c.decompress(res)
out = {
    'original_size':     res.get('original_size'),
    'compressed_size':   res.get('compressed_size'),
    'ratio':             res.get('original_size', 0) / max(1, res.get('compressed_size', 1)),
    'num_chunks':        res.get('num_chunks'),
    'avg_coherence':     res.get('avg_coherence'),
    'method':            res.get('method'),
    'lossless':          (data == restored),
    'library_size':      len(c._pattern_names),
}
print(json.dumps(out))
`;
    return _runPython(script, cwd);
  },

  void_resonance(_oracle, args) {
    const cwd = _resolveVoidRepo();
    const top = args.top || 10;
    const domainFilter = args.domain || null;
    const escDomain = JSON.stringify(domainFilter);
    const script = `
import json
from resonance_detector import ResonanceDetector
det = ResonanceDetector(substrate_dir='.')
field = det.scan()
items = []
for r in field.resonances:
    if ${escDomain} and ${escDomain} not in (r.domain_a, r.domain_b): continue
    items.append({
        'a': r.domain_a, 'b': r.domain_b,
        'corr': round(r.correlation, 4),
        'score': round(r.combined_score, 4),
        'type': r.resonance_type,
    })
items.sort(key=lambda x: -abs(x['score']))
out = {'count': len(items), 'top': items[:${top}]}
print(json.dumps(out))
`;
    return _runPython(script, cwd);
  },

  void_pattern_match(_oracle, args) {
    const cwd = _resolveVoidRepo();
    const top = args.top || 5;
    const escaped = JSON.stringify(args.input);
    const script = `
import json, io, contextlib
from collections import Counter
with contextlib.redirect_stdout(io.StringIO()):
    from void_compressor_v4 import FractalVoidCompressor
    c = FractalVoidCompressor()
data = (${escaped}).encode('utf-8')
res = c.compress(data)
chunks = res.get('chunks', [])
picks = Counter()
for ch in chunks:
    a = ch.get('idx_a'); b = ch.get('idx_b')
    if isinstance(a, int) and 0 <= a < len(c._pattern_names): picks[a] += 1
    if isinstance(b, int) and 0 <= b < len(c._pattern_names): picks[b] += 1
top_items = []
for idx, n in picks.most_common(${top}):
    top_items.append({
        'index': idx,
        'count': n,
        'name':  c._pattern_names[idx],
        'uri':   c.get_uri(idx),
    })
out = {
    'avg_coherence': round(res.get('avg_coherence', 0), 4),
    'ratio':         res['original_size'] / max(1, res['compressed_size']),
    'num_chunks':    res.get('num_chunks'),
    'top_matches':   top_items,
}
print(json.dumps(out))
`;
    return _runPython(script, cwd);
  },

  void_uri_lookup(_oracle, args) {
    const cwd = _resolveVoidRepo();
    const escUri = JSON.stringify(args.uri);
    const script = `
import json, io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    from void_compressor_v4 import FractalVoidCompressor
    c = FractalVoidCompressor()
result = c.lookup_by_uri(${escUri})
if result is None:
    out = {'found': False, 'uri': ${escUri}}
else:
    idx, wf = result
    out = {
        'found': True,
        'uri': c.get_uri(idx),
        'requested_uri': ${escUri},
        'index': idx,
        'name': c._pattern_names[idx],
        'waveform_len': len(wf),
        'waveform_min': float(min(wf)),
        'waveform_max': float(max(wf)),
        'waveform_std': float(((sum((x - sum(wf)/len(wf))**2 for x in wf) / len(wf)) ** 0.5)),
    }
print(json.dumps(out))
`;
    return _runPython(script, cwd);
  },

  void_ecosystem(_oracle, args) {
    const cwd = _resolveVoidRepo();
    const verbose = args.verbose !== false;
    const script = `
import json
from collections import Counter
with open('pattern_uri_index.json') as f:
    idx = json.load(f)
records_path = 'cross_repo_function_records.json'
try:
    with open(records_path) as f:
        records_data = json.load(f)
    records = records_data['records']
except FileNotFoundError:
    records = []

# URIs by repo
by_repo = Counter()
for u in idx['index_by_uri']:
    try:
        repo = u.split('://')[1].split('/')[0]
        by_repo[repo] += 1
    except: pass

# Coherency mean
unifieds = [r['coherency_v1']['unified'] for r in records if r.get('coherency_v1', {}).get('unified') is not None]
coh_mean = sum(unifieds) / len(unifieds) if unifieds else 0.0

# Provenance coverage
with_prov = sum(1 for r in records if r.get('derived_from'))
prov_pct = with_prov / len(records) if records else 0.0

out = {
    'total_uris':              idx['unique_waveform_count'],
    'total_records':           len(records),
    'records_with_provenance': with_prov,
    'provenance_coverage':     round(prov_pct, 3),
    'mean_coherency_v1':       round(coh_mean, 4),
    'domain_distribution':     dict(idx['domain_distribution']),
}
if ${verbose ? 'True' : 'False'}:
    out['by_repo'] = dict(by_repo.most_common())
print(json.dumps(out))
`;
    return _runPython(script, cwd);
  },
};

module.exports = { VOID_TOOLS, VOID_HANDLERS };
