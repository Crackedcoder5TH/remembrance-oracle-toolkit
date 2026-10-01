/**
 * THE TRAP EQUATION — the live evaluator applies the fitted constants
 * (seeds/trap-equation.json) exactly as the fitter measured them:
 * fire the loudest trap iff I(x) > θ_I, silent on everything else.
 * The measured fit (2026-09-30): 44/92 recorded sins fire, 4/200
 * backdrop false-fires, top-1 identity 70/92 — the floors asserted
 * here sit under those numbers so a refit that IMPROVES the equation
 * never reddens the suite, and a refit that collapses it does.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { fire } = require(path.join(ROOT, 'src', 'tools', 'trap-equation.js'));
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', 'traps.seed.json'), 'utf8'));
const eq = JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', 'trap-equation.json'), 'utf8'));

test('the equation fires on the recorded sins at or above its measured floor', () => {
  const traps = seed.traps;
  let fired = 0, own = 0;
  for (let i = 0; i < traps.length; i++) {
    const hit = fire(String(traps[i].wrong || ''));
    if (hit) {
      fired++;
      if (hit.index === i) own++;
    }
  }
  // measured 44/92 fire, and of the whole corpus 70/92 identify top-1;
  // floors: at least a third fire, and most of what fires finds its own trap
  assert.ok(fired >= Math.floor(traps.length / 3),
    `only ${fired}/${traps.length} sins fire — the equation collapsed under a refit`);
  assert.ok(own / fired >= 0.5,
    `only ${own}/${fired} fired sins found their own trap — identity collapsed`);
});

test('the equation stays silent on vocabulary it never fitted', () => {
  const benign = 'the quiet garden grows slowly under the calm morning rain while '
    + 'birdsong drifts across the meadow and the old oak keeps its patient watch';
  assert.strictEqual(fire(benign), null);
});

test('the fire rule honors the seed’s own θ_I', () => {
  const thetaI = eq.lexical_model.theta_I;
  const traps = seed.traps;
  for (let i = 0; i < traps.length; i++) {
    const hit = fire(String(traps[i].wrong || ''));
    if (hit) assert.ok(hit.score > thetaI, `fired at ${hit.score} ≤ θ_I ${thetaI}`);
  }
});

test('an absent seed is silent, never wrong', () => {
  // the module caches; simulate absence via a fresh require in a temp-root copy
  const src = fs.readFileSync(path.join(ROOT, 'src', 'tools', 'trap-equation.js'), 'utf8');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trap-eq-'));
  fs.mkdirSync(path.join(tmp, 'src', 'tools'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'seeds'), { recursive: true });
  const mod = path.join(tmp, 'src', 'tools', 'trap-equation.js');
  fs.writeFileSync(mod, src);
  const { fire: fireEmpty } = require(mod);
  assert.strictEqual(fireEmpty('calling compress with text and reading the ratio'), null);
});
