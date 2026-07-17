// entropy-fetch.mjs — assemble genuinely independent entropy streams for the
// incompressible-residual test and cache them as a committed fixture.
//
// Physical (unrelated mechanisms): ANU quantum-optical vacuum, random.org
// atmospheric radio noise, NIST quantum beacon, CPU timing jitter (oscillator/
// thermal noise — the jitterentropy/haveged source). Radioactive-decay hardware
// needs a paid HotBits key and is not fetchable here.
// Chaotic: a logistic map AT ITS NOISE FLOOR (roundoff-driven low mantissa bits).
// Algorithmic controls: CSPRNG, mulberry32 PRNG, Gaussian.
//
// Network streams (ANU/atmospheric/NIST) are reused from an existing fixture when
// present so we do not re-hit rate limits; pass ENTROPY_REFETCH=1 to pull fresh.
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';

const OUT = process.env.ENTROPY_CACHE || new URL('./fixtures/entropy-residual-data.json', import.meta.url).pathname;
const PRIOR = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; } })();
const get = (url) => new Promise((res, rej) => { https.get(url, { headers: { 'User-Agent': 'remembrance-entropy-study/1.0' }, timeout: 30000 }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); }); });
const refetch = process.env.ENTROPY_REFETCH === '1';
const out = {};

// --- physical network sources: reuse cache unless refetch ---
if (!refetch && Array.isArray(PRIOR.anu_quantum) && PRIOR.anu_quantum.length) {
  out.anu_quantum = PRIOR.anu_quantum; out.atmospheric = PRIOR.atmospheric; out.nist_quantum = PRIOR.nist_quantum;
  console.error('reused cached ANU/atmospheric/NIST');
} else {
  const anu = [];
  for (let i = 0; i < 12; i++) { try { const j = JSON.parse(await get('https://qrng.anu.edu.au/API/jsonI.php?length=1024&type=uint8')); if (j.success) anu.push(...j.data); } catch (e) { console.error('anu', e.message); } }
  out.anu_quantum = anu;
  try { out.atmospheric = (await get('https://www.random.org/integers/?num=10000&min=0&max=255&col=1&base=10&format=plain&rnd=new')).trim().split(/\s+/).map(Number).filter(Number.isFinite); } catch (e) { out.atmospheric = []; }
  const nist = []; try { const last = JSON.parse(await get('https://beacon.nist.gov/beacon/2.0/pulse/last')); const chain = last.pulse.chainIndex, start = Number(last.pulse.pulseIndex); for (let n = start; n > start - 48 && n > 0; n--) { try { const p = JSON.parse(await get(`https://beacon.nist.gov/beacon/2.0/chain/${chain}/pulse/${n}`)); const hex = p.pulse.outputValue; for (let i = 0; i < hex.length; i += 2) nist.push(parseInt(hex.substr(i, 2), 16)); } catch (_) {} } } catch (e) {}
  out.nist_quantum = nist;
}

// --- CPU timing jitter: LSB of nanosecond deltas of a busy loop (thermal/oscillator noise) ---
const jit = []; let prev = process.hrtime.bigint();
while (jit.length < 12000) { let acc = 0; for (let j = 0; j < 40; j++) acc += Math.sqrt(j + jit.length * 1.7); if (acc < 0) throw new Error('nope'); const now = process.hrtime.bigint(); jit.push(Number(now - prev) & 0xff); prev = now; }
out.thermal_jitter = jit;

// --- chaotic map AT ITS NOISE FLOOR: low mantissa bits (roundoff-driven, unpredictable) ---
let x = 0.3141592653589793; const r = 3.9999999; const chaos = [];
for (let i = 0; i < 20000 && chaos.length < 12000; i++) { x = r * x * (1 - x); if (i < 200) continue; chaos.push(Math.floor(x * Math.pow(2, 44)) & 0xff); }
out.chaotic_noisefloor = chaos;

// --- algorithmic controls ---
out.csprng = Array.from(crypto.randomBytes(12000));
let s = 0x9e3779b9; const mul = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); };
out.prng_mulberry = Array.from({ length: 12000 }, () => mul() & 0xff);
const g = () => { let u = 0, v = 0; while (u < 1e-9) u = (mul() >>> 0) / 4294967296; v = (mul() >>> 0) / 4294967296; return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
out.gaussian = Array.from({ length: 12000 }, () => Math.max(0, Math.min(255, Math.round(128 + 40 * g()))));

fs.writeFileSync(OUT, JSON.stringify(out));
console.error('\nwrote', OUT);
for (const k of Object.keys(out)) console.error('  ', k.padEnd(18), (out[k] || []).length, 'values');
