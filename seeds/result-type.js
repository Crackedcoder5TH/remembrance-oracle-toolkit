/**
 * Result Type — Monadic error handling without exceptions.
 * Inspired by Rust's Result<T, E> and Haskell's Either.
 *
 * Ok(value) — success, Err(error) — failure.
 * Chainable: map, flatMap, mapErr, unwrap, unwrapOr, match.
 */
function Ok(value) {
  return {
    ok: true,
    value,
    error: undefined,
    map(fn) { return Ok(fn(value)); },
    flatMap(fn) { return fn(value); },
    mapErr() { return this; },
    unwrap() { return value; },
    unwrapOr() { return value; },
    unwrapErr() { throw new Error('Called unwrapErr on Ok'); },
    match(handlers) { return handlers.ok(value); },
    tap(fn) { fn(value); return this; },
    toString() { return `Ok(${JSON.stringify(value)})`; },
  };
}

function Err(error) {
  return {
    ok: false,
    value: undefined,
    error,
    map() { return this; },
    flatMap() { return this; },
    mapErr(fn) { return Err(fn(error)); },
    unwrap() { throw error instanceof Error ? error : new Error(String(error)); },
    unwrapOr(defaultValue) { return defaultValue; },
    unwrapErr() { return error; },
    match(handlers) { return handlers.err(error); },
    tap() { return this; },
    toString() { return `Err(${JSON.stringify(error)})`; },
  };
}

/**
 * Wrap a function call in a Result — catches exceptions automatically.
 */
function tryCatch(fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(Ok, Err);
    }
    return Ok(result);
  } catch (e) {
    return Err(e);
  }
}

/**
 * Collect an array of Results into a single Result.
 * Returns Ok([values]) if all Ok, or the first Err.
 */
function all(results) {
  const values = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return Ok(values);
}

module.exports = { Ok, Err, tryCatch, all };
