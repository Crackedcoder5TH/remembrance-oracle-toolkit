// entropy-fetch.mjs — assemble genuinely independent entropy streams for the
// incompressible-residual test and cache them as a committed fixture. Every
// source ends up as a plain uint8 array read identically downstream, so the
// substrate pipeline treats them all the same (provenance matched by construction).
//
// Physical (unrelated mechanisms): ANU quantum-optical vacuum, random.org
// atmospheric radio, NIST quantum beacon, CPU timing jitter (thermal/oscillator).
// Chaotic: logistic map at its noise floor. Algorithmic: CSPRNG, PRNG, Gaussian,
// and HotBits-pseudorandom (fetched over the NETWORK — breaks the physical/network
// collinearity). Radioactive decay needs a paid HotBits key and is absent.
//
// ANU is rate-limited (~1 KB/minute) so it is dripped with spacing and ACCUMULATED
// across runs; everything else is pulled/generated in bulk. Existing ANU/atmos/
// NIST are reused and topped up unless ENTROPY_REFETCH=1.
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';

const OUT = process.env.ENTROPY_CACHE || new URL('./fixtures/entropy-residual-data.json', import.meta.url).pathname;
const PRIOR = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; } })();
const get = (url) => new Promise((res, rej) => { https.get(url, { headers: { 'User-Agent': 'remembrance-entropy-study/1.0' }, timeout: 30000 }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString('utf8'))); }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const BULK = 40000;

// --- ANU quantum: accumulate onto whatever we already have, dripping ~10s apart ---
out.anu_quantum = (PRIOR.anu_quantum || []).slice();
console.error('ANU start:', out.anu_quantum.length, '— dripping…');
for (let i = 0; i < 26 && out.anu_quantum.length < 8192; i++) {
  try { const j = JSON.parse(await get('https://qrng.anu.edu.au/API/jsonI.php?length=1024&type=uint8')); if (j.success && Array.isArray(j.data)) { out.anu_quantum.push(...j.data); console.error('  +1024 →', out.anu_quantum.length); } }
  catch (e) { /* rate-limited */ }
  await wait(10000);
}
console.error('ANU final:', out.anu_quantum.length);

// --- atmospheric: pull two 10k blocks (20k) ---
out.atmospheric = (PRIOR.atmospheric || []).slice();
for (let b = 0; b < 2 && out.atmospheric.length < 20000; b++) { try { out.atmospheric.push(...(await get('https://www.random.org/integers/?num=10000&min=0&max=255&col=1&base=10&format=plain&rnd=new')).trim().split(/\s+/).map(Number).filter(Number.isFinite)); } catch (e) {} }
console.error('atmospheric:', out.atmospheric.length);

// --- NIST beacon: 120 pulses (~7.7 KB) ---
const nist = []; try { const last = JSON.parse(await get('https://beacon.nist.gov/beacon/2.0/pulse/last')); const chain = last.pulse.chainIndex, start = Number(last.pulse.pulseIndex); for (let n = start; n > start - 120 && n > 0; n--) { try { const p = JSON.parse(await get(`https://beacon.nist.gov/beacon/2.0/chain/${chain}/pulse/${n}`)); const hex = p.pulse.outputValue; for (let i = 0; i < hex.length; i += 2) nist.push(parseInt(hex.substr(i, 2), 16)); } catch (_) {} } } catch (e) {}
out.nist_quantum = nist; console.error('nist:', nist.length);

// --- HotBits pseudorandom over the network (network + algorithmic) ---
const hb = []; for (let b = 0; b < 4 && hb.length < 8192; b++) { try { const j = JSON.parse(await get('https://www.fourmilab.ch/cgi-bin/Hotbits.api?nbytes=2048&fmt=json&apikey=Pseudorandom')); if (Array.isArray(j.data)) hb.push(...j.data); } catch (e) {} }
out.hotbits_pseudo = hb; console.error('hotbits_pseudo:', hb.length);

// --- CPU timing jitter: LSB of nanosecond deltas of a busy loop (thermal/oscillator) ---
const jit = []; let prev = process.hrtime.bigint();
while (jit.length < BULK) { let acc = 0; for (let j = 0; j < 40; j++) acc += Math.sqrt(j + jit.length * 1.7); if (acc < 0) throw new Error('nope'); const now = process.hrtime.bigint(); jit.push(Number(now - prev) & 0xff); prev = now; }
out.thermal_jitter = jit;

// --- chaotic map AT ITS NOISE FLOOR (roundoff-driven low mantissa bits) ---
let x = 0.3141592653589793; const r = 3.9999999; const chaos = [];
for (let i = 0; i < BULK + 500 && chaos.length < BULK; i++) { x = r * x * (1 - x); if (i < 200) continue; chaos.push(Math.floor(x * Math.pow(2, 44)) & 0xff); }
out.chaotic_noisefloor = chaos;

// --- algorithmic controls ---
out.csprng = Array.from(crypto.randomBytes(BULK));
let s = 0x9e3779b9; const mul = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); };
out.prng_mulberry = Array.from({ length: BULK }, () => mul() & 0xff);
const g = () => { let u = 0, v = 0; while (u < 1e-9) u = (mul() >>> 0) / 4294967296; v = (mul() >>> 0) / 4294967296; return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); };
out.gaussian = Array.from({ length: BULK }, () => Math.max(0, Math.min(255, Math.round(128 + 40 * g()))));

fs.writeFileSync(OUT, JSON.stringify(out));
console.error('\nwrote', OUT);
for (const k of Object.keys(out)) console.error('  ', k.padEnd(18), (out[k] || []).length, 'values →', Math.floor((out[k] || []).length / 128), 'windows');
