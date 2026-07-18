// entropy-add-local-physical.mjs — add multiple LOCAL physical entropy sources so
// provenance (network vs local) and physics (physical vs algorithmic) are FULLY
// CROSSED. All tap real hardware noise sampled on-device, distinct subsystems:
//   thermal_jitter — CPU busy-loop timing (already in fixture)
//   mem_jitter     — DRAM/cache access-latency jitter (memory subsystem)
//   sched_jitter   — OS scheduler / event-loop tick jitter
// Each is the nanosecond-clock LSB under a different workload — genuine local
// physical entropy, local provenance.
import fs from 'node:fs';
const OUT = process.env.ENTROPY_CACHE || new URL('./fixtures/entropy-residual-data.json', import.meta.url).pathname;
const f = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const BULK = 40000;

// memory-access latency jitter
const buf = new Float64Array(1 << 22); for (let i = 0; i < buf.length; i++) buf[i] = i * 1.000001;
let idx = 12345; const mem = [];
while (mem.length < BULK) { const t0 = process.hrtime.bigint(); let acc = 0; for (let k = 0; k < 48; k++) { idx = (Math.imul(idx, 1103515245) + 12345) & ((1 << 22) - 1); acc += buf[idx]; } const t1 = process.hrtime.bigint(); if (acc === Infinity) break; mem.push(Number(t1 - t0) & 0xff); }
f.mem_jitter = mem;

// scheduler / event-loop tick jitter
const sched = []; let prev = process.hrtime.bigint();
await new Promise((res) => { function tick() { const t = process.hrtime.bigint(); sched.push(Number(t - prev) & 0xff); prev = t; if (sched.length < BULK) setImmediate(tick); else res(); } setImmediate(tick); });
f.sched_jitter = sched;

fs.writeFileSync(OUT, JSON.stringify(f));
console.error('added local-physical sources → mem_jitter', mem.length, '· sched_jitter', sched.length);
console.error('fixture now:', Object.keys(f).join(', '));
