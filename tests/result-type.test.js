const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Ok, Err, tryCatch, all } = require('../seeds/result-type');

describe('result-type', () => {
  it('Ok should hold value', () => {
    const r = Ok(42);
    assert.equal(r.ok, true);
    assert.equal(r.value, 42);
    assert.equal(r.unwrap(), 42);
  });

  it('Err should hold error', () => {
    const r = Err('oops');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'oops');
    assert.equal(r.unwrapErr(), 'oops');
  });

  it('unwrap on Err should throw', () => {
    assert.throws(() => Err('fail').unwrap());
  });

  it('unwrapErr on Ok should throw', () => {
    assert.throws(() => Ok(1).unwrapErr());
  });

  it('unwrapOr should provide default for Err', () => {
    assert.equal(Err('x').unwrapOr(99), 99);
    assert.equal(Ok(42).unwrapOr(99), 42);
  });

  it('map should transform Ok value', () => {
    const r = Ok(5).map(x => x * 2);
    assert.equal(r.unwrap(), 10);
  });

  it('map should skip Err', () => {
    const r = Err('e').map(x => x * 2);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'e');
  });

  it('flatMap should chain Results', () => {
    const divide = (a, b) => b === 0 ? Err('div by zero') : Ok(a / b);
    const r = Ok(10).flatMap(x => divide(x, 2));
    assert.equal(r.unwrap(), 5);

    const r2 = Ok(10).flatMap(x => divide(x, 0));
    assert.equal(r2.ok, false);
  });

  it('mapErr should transform Err', () => {
    const r = Err('fail').mapErr(e => e.toUpperCase());
    assert.equal(r.error, 'FAIL');
  });

  it('match should dispatch correctly', () => {
    const okResult = Ok(1).match({ ok: v => v + 10, err: () => 0 });
    assert.equal(okResult, 11);

    const errResult = Err('x').match({ ok: () => 0, err: e => e + '!' });
    assert.equal(errResult, 'x!');
  });

  it('tap should call function but return same Result', () => {
    let seen = null;
    const r = Ok(42).tap(v => { seen = v; });
    assert.equal(seen, 42);
    assert.equal(r.unwrap(), 42);

    seen = null;
    Err('e').tap(v => { seen = v; });
    assert.equal(seen, null); // tap doesn't fire on Err
  });

  it('tryCatch should wrap success', () => {
    const r = tryCatch(() => 42);
    assert.equal(r.ok, true);
    assert.equal(r.unwrap(), 42);
  });

  it('tryCatch should wrap failure', () => {
    const r = tryCatch(() => { throw new Error('boom'); });
    assert.equal(r.ok, false);
    assert.equal(r.error.message, 'boom');
  });

  it('all should collect Ok values', () => {
    const r = all([Ok(1), Ok(2), Ok(3)]);
    assert.deepEqual(r.unwrap(), [1, 2, 3]);
  });

  it('all should short-circuit on first Err', () => {
    const r = all([Ok(1), Err('bad'), Ok(3)]);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'bad');
  });

  it('toString should format nicely', () => {
    assert.equal(Ok(42).toString(), 'Ok(42)');
    assert.equal(Err('x').toString(), 'Err("x")');
  });
});
