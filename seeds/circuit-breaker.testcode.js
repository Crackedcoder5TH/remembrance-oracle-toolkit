// Test: circuit-breaker — inline assertions, no require
const cb1 = createCircuitBreaker({ threshold: 3, cooldownMs: 50 });

// CLOSED state works
const r1 = cb1.exec(() => 42);
if (r1 !== 42) throw new Error('Expected 42, got ' + r1);
if (cb1.status().state !== 'CLOSED') throw new Error('Should be CLOSED');

// Opens after threshold failures
for (let i = 0; i < 3; i++) {
  try { cb1.exec(() => { throw new Error('fail'); }); } catch(e) {}
}
if (cb1.status().state !== 'OPEN') throw new Error('Should be OPEN');

// Rejects when OPEN
let openRejected = false;
try { cb1.exec(() => 'nope'); } catch(e) { if (/Circuit OPEN/.test(e.message)) openRejected = true; }
if (!openRejected) throw new Error('Should reject when OPEN');

// Reset works
cb1.reset();
if (cb1.status().state !== 'CLOSED') throw new Error('Should be CLOSED after reset');
if (cb1.status().failures !== 0) throw new Error('Failures should be 0 after reset');

// Success tracking
const cb2 = createCircuitBreaker();
cb2.exec(() => 1);
cb2.exec(() => 2);
if (cb2.status().successes !== 2) throw new Error('Should track 2 successes');

// onStateChange callback
const transitions = [];
const cb3 = createCircuitBreaker({ threshold: 2, onStateChange: (t) => transitions.push(t) });
try { cb3.exec(() => { throw new Error('f1'); }); } catch(e) {}
try { cb3.exec(() => { throw new Error('f2'); }); } catch(e) {}
if (!transitions.some(t => t.to === 'OPEN')) throw new Error('Should fire onStateChange to OPEN');
