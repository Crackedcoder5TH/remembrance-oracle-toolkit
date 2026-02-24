// Test: result-type — inline assertions, no require
const ok1 = Ok(42);
if (!ok1.ok) throw new Error('Ok should be ok');
if (ok1.value !== 42) throw new Error('Ok value wrong');
if (ok1.unwrap() !== 42) throw new Error('unwrap wrong');

const err1 = Err('oops');
if (err1.ok) throw new Error('Err should not be ok');
if (err1.error !== 'oops') throw new Error('Err error wrong');
if (err1.unwrapErr() !== 'oops') throw new Error('unwrapErr wrong');

// unwrap on Err throws
let threw1 = false;
try { Err('fail').unwrap(); } catch(e) { threw1 = true; }
if (!threw1) throw new Error('unwrap on Err should throw');

// unwrapOr
if (Err('x').unwrapOr(99) !== 99) throw new Error('unwrapOr on Err wrong');
if (Ok(42).unwrapOr(99) !== 42) throw new Error('unwrapOr on Ok wrong');

// map
if (Ok(5).map(x => x * 2).unwrap() !== 10) throw new Error('map wrong');
if (Err('e').map(x => x * 2).ok) throw new Error('map on Err should stay Err');

// flatMap
const divide = (a, b) => b === 0 ? Err('div0') : Ok(a / b);
if (Ok(10).flatMap(x => divide(x, 2)).unwrap() !== 5) throw new Error('flatMap wrong');
if (Ok(10).flatMap(x => divide(x, 0)).ok) throw new Error('flatMap Err wrong');

// mapErr
if (Err('fail').mapErr(e => e.toUpperCase()).error !== 'FAIL') throw new Error('mapErr wrong');

// match
if (Ok(1).match({ ok: v => v + 10, err: () => 0 }) !== 11) throw new Error('match Ok wrong');
if (Err('x').match({ ok: () => 0, err: e => e + '!' }) !== 'x!') throw new Error('match Err wrong');

// tryCatch
const tc1 = tryCatch(() => 42);
if (!tc1.ok || tc1.unwrap() !== 42) throw new Error('tryCatch success wrong');
const tc2 = tryCatch(() => { throw new Error('boom'); });
if (tc2.ok) throw new Error('tryCatch failure should be Err');

// all
const all1 = all([Ok(1), Ok(2), Ok(3)]);
if (JSON.stringify(all1.unwrap()) !== '[1,2,3]') throw new Error('all Ok wrong');
const all2 = all([Ok(1), Err('bad'), Ok(3)]);
if (all2.ok) throw new Error('all with Err should fail');

// toString
if (Ok(42).toString() !== 'Ok(42)') throw new Error('toString Ok wrong');
