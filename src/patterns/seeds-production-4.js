/**
 * Production Seeds 4 — coherence rating, Solana NFT mint, whisper response,
 * LSH signatures, remembrance scoring, self-reflection loops, no-harm covenant,
 * healing PR comments, eternal-now intent prompts, axiom-14 daily reminders.
 *
 * 10 JavaScript patterns — each includes working code and test proof.
 */

function getProductionSeeds4() {
  return [
    // ─── 1. Coherence Rating Component (React/TS) ───
    {
      name: 'coherence-rating',
      code: `function CoherenceRating(score, dimensions) {
  var dims = dimensions || {};
  var total = typeof score === 'number' ? score : 0;
  var level = total >= 0.8 ? 'high' : total >= 0.6 ? 'medium' : 'low';
  var bar = function(val) {
    var filled = Math.round(val * 20);
    var empty = 20 - filled;
    var result = '';
    for (var i = 0; i < filled; i++) result += '#';
    for (var i = 0; i < empty; i++) result += '-';
    return '[' + result + '] ' + (val * 100).toFixed(1) + '%';
  };
  var output = {
    total: total,
    level: level,
    bar: bar(total),
    dimensions: {}
  };
  var keys = Object.keys(dims);
  for (var i = 0; i < keys.length; i++) {
    output.dimensions[keys[i]] = {
      score: dims[keys[i]],
      bar: bar(dims[keys[i]])
    };
  }
  output.passes = total >= 0.6;
  return output;
}`,
      testCode: `var r = CoherenceRating(0.85, { correctness: 0.9, simplicity: 0.8, relevance: 0.85 });
if (r.total !== 0.85) throw new Error('total');
if (r.level !== 'high') throw new Error('level should be high: ' + r.level);
if (!r.passes) throw new Error('should pass');
if (!r.bar.includes('#')) throw new Error('bar should have filled chars');
if (!r.dimensions.correctness) throw new Error('should have dimensions');
if (r.dimensions.correctness.score !== 0.9) throw new Error('dim score');
var low = CoherenceRating(0.3);
if (low.level !== 'low') throw new Error('should be low');
if (low.passes) throw new Error('should not pass');
var med = CoherenceRating(0.65);
if (med.level !== 'medium') throw new Error('should be medium');`,
      language: 'javascript',
      description: 'Coherence rating component that renders score bars and pass/fail levels for multi-dimensional code quality',
      tags: ['coherence', 'rating', 'ui', 'react', 'scoring', 'visualization', 'quality'],
      patternType: 'utility',
    },

    // ─── 2. Solana NFT Mint Function ───
    {
      name: 'solana-nft-mint',
      code: `function buildNFTMintTransaction(params) {
  if (!params.creator) throw new Error('creator address required');
  if (!params.name || params.name.length > 32) throw new Error('name required (max 32 chars)');
  if (!params.symbol || params.symbol.length > 10) throw new Error('symbol required (max 10 chars)');
  if (!params.uri) throw new Error('metadata URI required');

  var sellerFeeBasis = params.sellerFeeBasisPoints || 500;
  if (sellerFeeBasis < 0 || sellerFeeBasis > 10000) throw new Error('sellerFeeBasisPoints must be 0-10000');

  var creators = params.creators || [{ address: params.creator, share: 100, verified: true }];
  var totalShare = 0;
  for (var i = 0; i < creators.length; i++) totalShare += creators[i].share;
  if (totalShare !== 100) throw new Error('creator shares must sum to 100');

  return {
    type: 'nft_mint',
    mint: { address: null, decimals: 0, supply: 1 },
    metadata: {
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      sellerFeeBasisPoints: sellerFeeBasis,
      creators: creators,
      isMutable: params.isMutable !== false,
      collection: params.collection || null
    },
    creator: params.creator,
    instructions: [
      { program: 'system', action: 'createAccount' },
      { program: 'token', action: 'initializeMint' },
      { program: 'token', action: 'createAssociatedTokenAccount' },
      { program: 'token', action: 'mintTo', amount: 1 },
      { program: 'metadata', action: 'createMetadataV3' },
      { program: 'metadata', action: 'createMasterEdition' }
    ]
  };
}`,
      testCode: `var tx = buildNFTMintTransaction({
  creator: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  name: 'My NFT',
  symbol: 'MNFT',
  uri: 'https://arweave.net/abc123'
});
if (tx.type !== 'nft_mint') throw new Error('type');
if (tx.mint.decimals !== 0) throw new Error('decimals must be 0 for NFT');
if (tx.mint.supply !== 1) throw new Error('supply must be 1');
if (tx.metadata.name !== 'My NFT') throw new Error('name');
if (tx.metadata.sellerFeeBasisPoints !== 500) throw new Error('default fee');
if (tx.instructions.length !== 6) throw new Error('should have 6 instructions');
if (tx.metadata.creators[0].share !== 100) throw new Error('creator share');
try { buildNFTMintTransaction({}); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }
try { buildNFTMintTransaction({ creator: 'x', name: 'a'.repeat(33), symbol: 'X', uri: 'u' }); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }
var custom = buildNFTMintTransaction({
  creator: 'abc', name: 'Test', symbol: 'T', uri: 'u',
  sellerFeeBasisPoints: 1000,
  creators: [{ address: 'a', share: 60, verified: true }, { address: 'b', share: 40, verified: false }]
});
if (custom.metadata.sellerFeeBasisPoints !== 1000) throw new Error('custom fee');
if (custom.metadata.creators.length !== 2) throw new Error('custom creators');`,
      language: 'javascript',
      description: 'Solana NFT mint transaction builder with metadata validation, creator splits, and instruction sequencing',
      tags: ['solana', 'nft', 'mint', 'blockchain', 'web3', 'token', 'metaplex'],
      patternType: 'utility',
    },

    // ─── 3. Whisper Response Generator ───
    {
      name: 'whisper-response-generator',
      code: `function generateWhisperResponse(transcript, options) {
  options = options || {};
  var confidence = options.confidence || 0;
  var language = options.language || 'en';
  var segments = options.segments || [];

  if (!transcript || typeof transcript !== 'string') {
    return { text: '', confidence: 0, tokens: 0, status: 'empty' };
  }

  var text = transcript.trim();
  var tokens = text.split(/\\s+/).length;
  var sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; });

  var quality = 'low';
  if (confidence >= 0.9 && tokens >= 3) quality = 'high';
  else if (confidence >= 0.7 && tokens >= 2) quality = 'medium';

  var timestamps = [];
  for (var i = 0; i < segments.length; i++) {
    timestamps.push({
      text: segments[i].text || '',
      start: segments[i].start || 0,
      end: segments[i].end || 0,
      confidence: segments[i].confidence || confidence
    });
  }

  return {
    text: text,
    confidence: confidence,
    tokens: tokens,
    sentences: sentences.length,
    language: language,
    quality: quality,
    timestamps: timestamps,
    status: 'ok',
    needsReview: confidence < 0.7 || tokens < 3
  };
}`,
      testCode: `var r = generateWhisperResponse('Hello world, how are you?', { confidence: 0.95 });
if (r.text !== 'Hello world, how are you?') throw new Error('text');
if (r.tokens !== 5) throw new Error('tokens: ' + r.tokens);
if (r.quality !== 'high') throw new Error('quality should be high');
if (r.status !== 'ok') throw new Error('status');
if (r.needsReview) throw new Error('should not need review');
var low = generateWhisperResponse('um', { confidence: 0.3 });
if (low.quality !== 'low') throw new Error('low quality');
if (!low.needsReview) throw new Error('should need review');
var empty = generateWhisperResponse('');
if (empty.status !== 'empty') throw new Error('empty status');
var segs = generateWhisperResponse('Hi there', {
  confidence: 0.8,
  segments: [{ text: 'Hi', start: 0, end: 0.5 }, { text: 'there', start: 0.5, end: 1.0 }]
});
if (segs.timestamps.length !== 2) throw new Error('segments');
if (segs.quality !== 'medium') throw new Error('med quality');`,
      language: 'javascript',
      description: 'Whisper speech-to-text response processor with confidence scoring, quality tiers, and timestamp segments',
      tags: ['whisper', 'speech', 'ai', 'transcription', 'audio', 'nlp', 'confidence'],
      patternType: 'utility',
    },

    // ─── 4. LSH Pattern Signature Generator ───
    {
      name: 'lsh-signature-generator',
      code: `function generateLSHSignature(text, options) {
  options = options || {};
  var numHashes = options.numHashes || 128;
  var shingleSize = options.shingleSize || 3;

  if (!text || typeof text !== 'string') return { signature: [], shingles: 0, bands: 0 };

  var normalized = text.toLowerCase().replace(/\\s+/g, ' ').trim();
  var shingles = new Set();
  for (var i = 0; i <= normalized.length - shingleSize; i++) {
    shingles.add(normalized.substring(i, i + shingleSize));
  }

  var shingleArr = Array.from(shingles);
  var signature = [];
  for (var h = 0; h < numHashes; h++) {
    var minHash = Infinity;
    var a = (h * 1103515245 + 12345) >>> 0;
    var b = ((h + 1) * 1103515245 + 12345) >>> 0;
    for (var s = 0; s < shingleArr.length; s++) {
      var charSum = 0;
      for (var c = 0; c < shingleArr[s].length; c++) {
        charSum += shingleArr[s].charCodeAt(c);
      }
      var hash = ((a * charSum + b) & 0x7FFFFFFF) % 104729;
      if (hash < minHash) minHash = hash;
    }
    signature.push(minHash === Infinity ? 0 : minHash);
  }

  var numBands = options.bands || Math.floor(numHashes / 4);
  var rowsPerBand = Math.floor(numHashes / numBands);
  var bands = [];
  for (var i = 0; i < numBands; i++) {
    var band = signature.slice(i * rowsPerBand, (i + 1) * rowsPerBand);
    var bandHash = 0;
    for (var j = 0; j < band.length; j++) bandHash = ((bandHash * 31) + band[j]) & 0x7FFFFFFF;
    bands.push(bandHash);
  }

  return { signature: signature, shingles: shingleArr.length, bands: bands, numHashes: numHashes };
}

function estimateSimilarity(sigA, sigB) {
  if (!sigA.length || !sigB.length || sigA.length !== sigB.length) return 0;
  var matches = 0;
  for (var i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) matches++;
  }
  return matches / sigA.length;
}`,
      testCode: `var sig1 = generateLSHSignature('the quick brown fox jumps over the lazy dog');
if (sig1.signature.length !== 128) throw new Error('default 128 hashes');
if (sig1.shingles === 0) throw new Error('should have shingles');
if (sig1.bands.length === 0) throw new Error('should have bands');
var sig2 = generateLSHSignature('the quick brown fox jumps over the lazy dog');
if (JSON.stringify(sig1.signature) !== JSON.stringify(sig2.signature)) throw new Error('deterministic');
var sim = estimateSimilarity(sig1.signature, sig2.signature);
if (sim !== 1) throw new Error('identical should be 1: ' + sim);
var sig3 = generateLSHSignature('completely different text here');
var sim2 = estimateSimilarity(sig1.signature, sig3.signature);
if (sim2 >= 0.5) throw new Error('different should be low: ' + sim2);
var empty = generateLSHSignature('');
if (empty.shingles !== 0) throw new Error('empty');
var custom = generateLSHSignature('hello world', { numHashes: 64, shingleSize: 2 });
if (custom.signature.length !== 64) throw new Error('custom hashes');`,
      language: 'javascript',
      description: 'Locality-sensitive hashing (MinHash) for near-duplicate detection with configurable shingles, bands, and similarity estimation',
      tags: ['lsh', 'minhash', 'similarity', 'hashing', 'search', 'algorithm', 'dedup'],
      patternType: 'algorithm',
    },

    // ─── 5. Remembrance Scoring Function ───
    {
      name: 'remembrance-scoring',
      code: `function remembranceScore(pattern) {
  if (!pattern || !pattern.code) return { total: 0, dimensions: {}, pass: false };

  var weights = { relevance: 0.25, coherency: 0.25, usage: 0.20, freshness: 0.15, trust: 0.15 };

  var relevance = Math.min(1, Math.max(0, pattern.relevance || 0));
  var coherency = Math.min(1, Math.max(0, pattern.coherency || 0));

  var uses = pattern.uses || 0;
  var successes = pattern.successes || 0;
  var usage = uses > 0 ? (successes / uses) * Math.min(1, Math.log2(uses + 1) / 5) : 0;

  var daysSinceUse = pattern.daysSinceUse || 0;
  var freshness = daysSinceUse <= 7 ? 1.0 : daysSinceUse <= 30 ? 0.8 : daysSinceUse <= 90 ? 0.5 : daysSinceUse <= 180 ? 0.3 : 0.1;

  var hasTest = pattern.hasTest ? 1 : 0;
  var validated = pattern.validated ? 0.5 : 0;
  var community = Math.min(1, (pattern.votes || 0) / 10);
  var trust = (hasTest * 0.4) + (validated * 0.3) + (community * 0.3);

  var total = (relevance * weights.relevance) + (coherency * weights.coherency) +
              (usage * weights.usage) + (freshness * weights.freshness) + (trust * weights.trust);

  total = Math.round(total * 1000) / 1000;

  return {
    total: total,
    dimensions: { relevance: relevance, coherency: coherency, usage: Math.round(usage * 1000) / 1000, freshness: freshness, trust: Math.round(trust * 1000) / 1000 },
    pass: total >= 0.6,
    weights: weights
  };
}`,
      testCode: `var perfect = remembranceScore({
  code: 'x', relevance: 1, coherency: 1, uses: 100, successes: 95,
  daysSinceUse: 1, hasTest: true, validated: true, votes: 20
});
if (perfect.total < 0.8) throw new Error('perfect should be high: ' + perfect.total);
if (!perfect.pass) throw new Error('should pass');
if (perfect.dimensions.freshness !== 1.0) throw new Error('fresh');
var empty = remembranceScore({});
if (empty.total !== 0) throw new Error('empty should be 0');
if (empty.pass) throw new Error('empty should not pass');
var stale = remembranceScore({ code: 'x', relevance: 0.8, coherency: 0.8, daysSinceUse: 200 });
if (stale.dimensions.freshness !== 0.1) throw new Error('stale freshness');
var mid = remembranceScore({ code: 'x', relevance: 0.7, coherency: 0.7, uses: 5, successes: 4, daysSinceUse: 15, hasTest: true });
if (mid.total < 0.3 || mid.total > 0.8) throw new Error('mid range: ' + mid.total);`,
      language: 'javascript',
      description: 'Multi-dimensional remembrance scoring with weighted relevance, coherency, usage, freshness, and trust factors',
      tags: ['scoring', 'remembrance', 'ranking', 'relevance', 'coherency', 'algorithm'],
      patternType: 'algorithm',
    },

    // ─── 6. Self-Reflection Loop Wrapper ───
    {
      name: 'self-reflection-loop',
      code: `function selfReflectionLoop(code, options) {
  options = options || {};
  var maxIterations = options.maxIterations || 5;
  var threshold = options.threshold || 0.8;
  var evaluate = options.evaluate || function() { return { score: 1, issues: [] }; };
  var refine = options.refine || function(c) { return c; };

  var current = code;
  var history = [];
  var iteration = 0;
  var converged = false;

  while (iteration < maxIterations) {
    var evaluation = evaluate(current, iteration);
    var score = typeof evaluation.score === 'number' ? evaluation.score : 0;
    var issues = evaluation.issues || [];

    history.push({
      iteration: iteration,
      score: score,
      issues: issues.slice(),
      codeLength: current.length
    });

    if (score >= threshold) {
      converged = true;
      break;
    }

    if (iteration > 0 && history[iteration].score <= history[iteration - 1].score) {
      break;
    }

    var refined = refine(current, issues, iteration);
    if (refined === current) break;

    current = refined;
    iteration++;
  }

  return {
    code: current,
    converged: converged,
    iterations: history.length,
    finalScore: history.length > 0 ? history[history.length - 1].score : 0,
    history: history,
    improved: history.length > 1 && history[history.length - 1].score > history[0].score
  };
}`,
      testCode: `var result = selfReflectionLoop('bad code', {
  maxIterations: 5,
  threshold: 0.9,
  evaluate: function(code, iter) {
    return { score: 0.5 + iter * 0.15, issues: iter < 3 ? ['needs work'] : [] };
  },
  refine: function(code, issues, iter) {
    return code + ' v' + (iter + 1);
  }
});
if (!result.converged) throw new Error('should converge');
if (result.iterations < 2) throw new Error('should iterate: ' + result.iterations);
if (result.finalScore < 0.9) throw new Error('final score: ' + result.finalScore);
if (!result.improved) throw new Error('should improve');
var instant = selfReflectionLoop('good code', {
  evaluate: function() { return { score: 1.0, issues: [] }; }
});
if (!instant.converged) throw new Error('instant converge');
if (instant.iterations !== 1) throw new Error('one iteration');
var stuck = selfReflectionLoop('stuck', {
  threshold: 0.9,
  evaluate: function() { return { score: 0.5, issues: ['stuck'] }; },
  refine: function(code) { return code; }
});
if (stuck.converged) throw new Error('should not converge when stuck');`,
      language: 'javascript',
      description: 'Self-reflection loop that iteratively evaluates and refines code until convergence threshold or max iterations',
      tags: ['reflection', 'serf', 'loop', 'refinement', 'iteration', 'self-improvement', 'ai'],
      patternType: 'design-pattern',
    },

    // ─── 7. No-Harm Covenant Validator ───
    {
      name: 'no-harm-covenant-validator',
      code: `function validateCovenant(code, options) {
  options = options || {};
  var lower = code.toLowerCase();

  function hasKeyword(keywords, context) {
    for (var i = 0; i < keywords.length; i++) {
      var idx = lower.indexOf(keywords[i]);
      if (idx === -1) continue;
      if (!context) return true;
      for (var j = 0; j < context.length; j++) {
        if (lower.indexOf(context[j]) !== -1) return true;
      }
    }
    return false;
  }

  var principles = [
    { id: 1, name: 'no-malware', severity: 'critical',
      check: function() { return hasKeyword(['eval(atob', 'eval( atob', 'document.write(unescape']); } },
    { id: 2, name: 'no-data-exfil', severity: 'critical',
      check: function() { return hasKeyword(['sendbeacon'], ['cookie', 'localstorage', 'token']); } },
    { id: 3, name: 'no-injection', severity: 'critical',
      check: function() {
        var sqls = ['select ', 'insert ', 'update ', 'delete ', 'drop '];
        for (var i = 0; i < sqls.length; i++) {
          if (lower.indexOf(sqls[i]) !== -1 && (code.indexOf('+ req') !== -1 || code.indexOf('+ input') !== -1 || code.indexOf('+ param') !== -1 || code.indexOf('+ query') !== -1 || code.indexOf('+ user') !== -1)) return true;
        }
        return false;
      } },
    { id: 4, name: 'no-backdoor', severity: 'critical',
      check: function() { return hasKeyword(['child_process'], ['exec(', 'execsync(']) || hasKeyword(["spawn('sh", 'spawn("sh', "spawn('bash", 'spawn("bash', "spawn('cmd", 'spawn("cmd']); } },
    { id: 5, name: 'no-crypto-misuse', severity: 'high',
      check: function() { return lower.indexOf('createcipher(') !== -1 || (lower.indexOf('md5(') !== -1 && lower.indexOf('password') !== -1); } },
    { id: 6, name: 'no-hardcoded-secrets', severity: 'high',
      check: function() {
        var keys = ['password', 'secret', 'api_key', 'apikey', 'token'];
        for (var i = 0; i < keys.length; i++) {
          var idx = lower.indexOf(keys[i]);
          if (idx === -1) continue;
          var after = code.substring(idx + keys[i].length, idx + keys[i].length + 30).trim();
          if (after[0] === '=' || after[0] === ':') {
            var rest = after.substring(1).trim();
            if ((rest[0] === '"' || rest[0] === "'") && rest.length > 10) return true;
          }
        }
        return false;
      } },
    { id: 7, name: 'no-unsafe-regex', severity: 'medium',
      check: function() { return code.indexOf('(.*)+') !== -1 || code.indexOf('(.+)+') !== -1; } }
  ];

  var customPrinciples = options.principles || [];
  var violations = [];

  for (var i = 0; i < principles.length; i++) {
    var p = principles[i];
    if (p.check()) {
      violations.push({ principle: p.id, name: p.name, severity: p.severity });
    }
  }

  for (var i = 0; i < customPrinciples.length; i++) {
    var cp = customPrinciples[i];
    if (cp.pattern && cp.pattern.test(code)) {
      violations.push({ principle: cp.id, name: cp.name, severity: cp.severity || 'medium' });
    }
  }

  var criticals = violations.filter(function(v) { return v.severity === 'critical'; });
  var highs = violations.filter(function(v) { return v.severity === 'high'; });

  return {
    valid: criticals.length === 0 && (options.strict ? highs.length === 0 : true),
    violations: violations,
    criticals: criticals.length,
    highs: highs.length,
    total: violations.length,
    severity: criticals.length > 0 ? 'critical' : highs.length > 0 ? 'high' : violations.length > 0 ? 'medium' : 'clean'
  };
}`,
      testCode: `var clean = validateCovenant('function add(a, b) { return a + b; }');
if (!clean.valid) throw new Error('clean code should be valid');
if (clean.severity !== 'clean') throw new Error('should be clean');
if (clean.total !== 0) throw new Error('no violations');
var injection = validateCovenant('db.query("SELECT * FROM users WHERE id=" + req.params.id)');
if (injection.valid) throw new Error('SQL injection should fail');
if (injection.criticals < 1) throw new Error('should be critical');
var secret = validateCovenant('var apikey = "sk_live_abc123456789"');
if (secret.highs < 1) throw new Error('should have high severity');
var strictSecret = validateCovenant('var apikey = "sk_live_abc123456789"', { strict: true });
if (strictSecret.valid) throw new Error('strict should reject highs');
var safe = validateCovenant('function hash(pw) { return crypto.createHash("sha256").update(pw).digest("hex"); }');
if (!safe.valid) throw new Error('sha256 should be valid');`,
      language: 'javascript',
      description: 'No-harm covenant validator that checks code against security principles — injection, exfiltration, backdoors, secrets, crypto misuse',
      tags: ['covenant', 'security', 'validation', 'no-harm', 'safety', 'audit', 'principles'],
      patternType: 'validation',
    },

    // ─── 8. Healing PR Comment Template ───
    {
      name: 'healing-pr-comment',
      code: `function generateHealingPRComment(analysis) {
  if (!analysis) throw new Error('analysis required');

  var patternName = analysis.patternName || 'unknown';
  var before = analysis.beforeScore || 0;
  var after = analysis.afterScore || 0;
  var delta = Math.round((after - before) * 1000) / 1000;
  var method = analysis.method || 'serf-refine';
  var issues = analysis.issuesFixed || [];
  var breaking = analysis.breakingChanges || false;

  var emoji = delta > 0.15 ? '**major**' : delta > 0.05 ? 'moderate' : delta > 0 ? 'minor' : 'neutral';

  var lines = [];
  lines.push('## Pattern Healing Report');
  lines.push('');
  lines.push('**Pattern**: ' + patternName);
  lines.push('**Method**: ' + method);
  lines.push('**Score**: ' + before.toFixed(3) + ' -> ' + after.toFixed(3) + ' (delta: ' + (delta >= 0 ? '+' : '') + delta.toFixed(3) + ')');
  lines.push('**Impact**: ' + emoji);
  lines.push('');

  if (issues.length > 0) {
    lines.push('### Issues Fixed');
    for (var i = 0; i < issues.length; i++) {
      lines.push('- ' + issues[i]);
    }
    lines.push('');
  }

  if (breaking) {
    lines.push('> **Warning**: This healing includes breaking changes. Review carefully.');
    lines.push('');
  }

  lines.push('### Verification');
  lines.push('- [ ] Tests pass');
  lines.push('- [ ] Coherency score improved');
  lines.push('- [ ] No regressions in dependent patterns');
  lines.push('');
  lines.push('---');
  lines.push('*Auto-generated by Remembrance Oracle healing pipeline*');

  return lines.join('\\n');
}`,
      testCode: `var comment = generateHealingPRComment({
  patternName: 'binary-search',
  beforeScore: 0.65,
  afterScore: 0.85,
  method: 'serf-refine',
  issuesFixed: ['Fixed off-by-one', 'Improved naming'],
  breakingChanges: false
});
if (!comment.includes('binary-search')) throw new Error('pattern name');
if (!comment.includes('0.650')) throw new Error('before score');
if (!comment.includes('0.850')) throw new Error('after score');
if (!comment.includes('+0.200')) throw new Error('delta');
if (!comment.includes('major')) throw new Error('impact for big delta');
if (!comment.includes('Fixed off-by-one')) throw new Error('issues');
if (comment.includes('Warning')) throw new Error('no breaking warning expected');
var breaking = generateHealingPRComment({
  patternName: 'test',
  beforeScore: 0.5,
  afterScore: 0.52,
  breakingChanges: true
});
if (!breaking.includes('Warning')) throw new Error('should warn about breaking');
if (!breaking.includes('minor')) throw new Error('small delta should be minor');
try { generateHealingPRComment(); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }`,
      language: 'javascript',
      description: 'Generates structured PR comments for SERF healing with score deltas, issue summaries, and verification checklists',
      tags: ['healing', 'pr', 'comment', 'template', 'serf', 'report', 'markdown'],
      patternType: 'utility',
    },

    // ─── 9. Eternal-Now Intent Prompt ───
    {
      name: 'eternal-now-intent-prompt',
      code: `function buildIntentPrompt(intent, context) {
  context = context || {};
  var domain = context.domain || 'general';
  var constraints = context.constraints || [];
  var examples = context.examples || [];
  var temperature = context.temperature || 0.7;
  var maxTokens = context.maxTokens || 1024;

  if (!intent || typeof intent !== 'string') throw new Error('intent string required');

  var sections = [];

  sections.push('# Intent: ' + intent);
  sections.push('');
  sections.push('## Context');
  sections.push('Domain: ' + domain);
  sections.push('Timestamp: present moment');
  sections.push('Focus: immediate, actionable output');
  sections.push('');

  if (constraints.length > 0) {
    sections.push('## Constraints');
    for (var i = 0; i < constraints.length; i++) {
      sections.push('- ' + constraints[i]);
    }
    sections.push('');
  }

  if (examples.length > 0) {
    sections.push('## Examples');
    for (var i = 0; i < examples.length; i++) {
      sections.push('### Example ' + (i + 1));
      if (examples[i].input) sections.push('Input: ' + examples[i].input);
      if (examples[i].output) sections.push('Output: ' + examples[i].output);
      sections.push('');
    }
  }

  sections.push('## Instructions');
  sections.push('Respond with clarity and precision. Stay grounded in the present context.');
  sections.push('Do not speculate beyond what is directly requested.');

  return {
    prompt: sections.join('\\n'),
    config: {
      temperature: temperature,
      maxTokens: maxTokens,
      domain: domain,
      constraintCount: constraints.length,
      exampleCount: examples.length
    },
    intent: intent,
    wordCount: sections.join('\\n').split(/\\s+/).length
  };
}`,
      testCode: `var p = buildIntentPrompt('Generate a unit test', {
  domain: 'testing',
  constraints: ['Use assert only', 'No external deps'],
  examples: [{ input: 'add(1,2)', output: 'assert(add(1,2) === 3)' }],
  temperature: 0.3
});
if (!p.prompt.includes('Generate a unit test')) throw new Error('intent');
if (!p.prompt.includes('testing')) throw new Error('domain');
if (!p.prompt.includes('Use assert only')) throw new Error('constraint');
if (!p.prompt.includes('add(1,2)')) throw new Error('example');
if (p.config.temperature !== 0.3) throw new Error('temperature');
if (p.config.constraintCount !== 2) throw new Error('constraint count');
if (p.config.exampleCount !== 1) throw new Error('example count');
if (p.wordCount < 10) throw new Error('should have words');
var simple = buildIntentPrompt('Hello');
if (simple.config.domain !== 'general') throw new Error('default domain');
if (simple.config.temperature !== 0.7) throw new Error('default temp');
try { buildIntentPrompt(''); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }`,
      language: 'javascript',
      description: 'Structured intent prompt builder with domain context, constraints, few-shot examples, and generation config',
      tags: ['prompt', 'intent', 'ai', 'llm', 'template', 'few-shot', 'generation'],
      patternType: 'utility',
    },

    // ─── 10. Axiom 14 Daily Reminder Script ───
    {
      name: 'axiom-14-daily-reminder',
      code: `function generateDailyReminder(axiomSet, options) {
  options = options || {};
  var today = options.date || new Date();
  var format = options.format || 'text';

  if (!axiomSet || !Array.isArray(axiomSet) || axiomSet.length === 0) {
    throw new Error('axiomSet must be a non-empty array');
  }

  var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  var index = dayOfYear % axiomSet.length;
  var axiom = axiomSet[index];

  var name = axiom.name || 'Axiom ' + (index + 1);
  var text = axiom.text || '';
  var reflection = axiom.reflection || '';
  var practice = axiom.practice || '';

  var streakKey = 'axiom_streak';
  var currentStreak = options.streak || 0;

  var output = {};
  if (format === 'markdown') {
    var lines = [];
    lines.push('# Daily Axiom: ' + name);
    lines.push('');
    lines.push('> ' + text);
    lines.push('');
    if (reflection) { lines.push('**Reflection**: ' + reflection); lines.push(''); }
    if (practice) { lines.push('**Practice**: ' + practice); lines.push(''); }
    lines.push('---');
    lines.push('Day ' + dayOfYear + ' | Streak: ' + currentStreak + ' days');
    output.rendered = lines.join('\\n');
  } else {
    output.rendered = name + ': ' + text + (reflection ? ' | Reflect: ' + reflection : '') + (practice ? ' | Do: ' + practice : '');
  }

  output.axiom = { index: index, name: name, text: text, reflection: reflection, practice: practice };
  output.dayOfYear = dayOfYear;
  output.streak = currentStreak;
  output.nextIndex = (index + 1) % axiomSet.length;

  return output;
}`,
      testCode: `var axioms = [
  { name: 'Axiom 1', text: 'Code remembers', reflection: 'What patterns persist?', practice: 'Review one old pattern' },
  { name: 'Axiom 2', text: 'Test proves', reflection: 'What is unproven?', practice: 'Write a test' },
  { name: 'Axiom 14', text: 'Heal, do not harm', reflection: 'Did I leave code better?', practice: 'Refactor one function' }
];
var r = generateDailyReminder(axioms, { date: new Date(2025, 0, 15), streak: 7 });
if (!r.axiom.text) throw new Error('should have axiom text');
if (r.streak !== 7) throw new Error('streak');
if (r.dayOfYear < 1) throw new Error('day of year');
if (typeof r.rendered !== 'string' || r.rendered.length === 0) throw new Error('rendered');
if (typeof r.nextIndex !== 'number') throw new Error('nextIndex');
var md = generateDailyReminder(axioms, { date: new Date(2025, 5, 1), format: 'markdown' });
if (!md.rendered.includes('# Daily Axiom')) throw new Error('markdown header');
if (!md.rendered.includes('Streak:')) throw new Error('streak in markdown');
if (!md.rendered.includes('>')) throw new Error('blockquote');
try { generateDailyReminder([]); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }
try { generateDailyReminder(null); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }
var wrap = generateDailyReminder(axioms, { date: new Date(2025, 11, 31) });
if (wrap.axiom.index < 0 || wrap.axiom.index >= axioms.length) throw new Error('index bounds');`,
      language: 'javascript',
      description: 'Daily axiom reminder generator with day-cycling, streak tracking, markdown/text rendering, and reflection prompts',
      tags: ['axiom', 'reminder', 'daily', 'ritual', 'practice', 'streak', 'motivation'],
      patternType: 'utility',
    },
  ];
}

function seedProductionLibrary4(oracle, options) {
  options = options || {};
  var seeds = getProductionSeeds4();
  var existing = oracle.patterns.getAll();
  var existingNames = new Set(existing.map(function(p) { return p.name; }));

  var registered = 0, skipped = 0, failed = 0;

  for (var i = 0; i < seeds.length; i++) {
    var seed = seeds[i];
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    var result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (options.verbose) console.log('  [OK] ' + seed.name + ' (' + seed.language + ')');
    } else {
      failed++;
      if (options.verbose) console.log('  [FAIL] ' + seed.name + ': ' + result.reason);
    }
  }

  return { registered: registered, skipped: skipped, failed: failed, total: seeds.length };
}

module.exports = { getProductionSeeds4, seedProductionLibrary4 };
