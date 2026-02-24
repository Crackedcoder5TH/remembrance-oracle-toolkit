const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMiddlewareChain } = require('../seeds/middleware-chain');

describe('middleware-chain', () => {
  it('should execute middleware in order', async () => {
    const chain = createMiddlewareChain();
    const ctx = { log: [] };

    chain.use(async (ctx, next) => { ctx.log.push('a'); await next(); });
    chain.use(async (ctx, next) => { ctx.log.push('b'); await next(); });
    chain.use(async (ctx, next) => { ctx.log.push('c'); await next(); });

    await chain.execute(ctx);
    assert.deepEqual(ctx.log, ['a', 'b', 'c']);
  });

  it('should support onion-style wrapping', async () => {
    const chain = createMiddlewareChain();
    const ctx = { log: [] };

    chain.use(async (ctx, next) => {
      ctx.log.push('a-before');
      await next();
      ctx.log.push('a-after');
    });
    chain.use(async (ctx, next) => {
      ctx.log.push('b-before');
      await next();
      ctx.log.push('b-after');
    });

    await chain.execute(ctx);
    assert.deepEqual(ctx.log, ['a-before', 'b-before', 'b-after', 'a-after']);
  });

  it('should stop if next not called', async () => {
    const chain = createMiddlewareChain();
    const ctx = { log: [] };

    chain.use(async (ctx) => { ctx.log.push('a'); /* no next() */ });
    chain.use(async (ctx, next) => { ctx.log.push('b'); await next(); });

    await chain.execute(ctx);
    assert.deepEqual(ctx.log, ['a']); // b never runs
  });

  it('should propagate errors', async () => {
    const chain = createMiddlewareChain();
    chain.use(async () => { throw new Error('middleware-error'); });

    await assert.rejects(
      () => chain.execute({}),
      { message: 'middleware-error' }
    );
  });

  it('should handle errors with error middleware', async () => {
    const chain = createMiddlewareChain();
    const ctx = { error: null };

    chain.use(async () => { throw new Error('oops'); });
    chain.onError(async (err, ctx) => { ctx.error = err.message; });

    await chain.execute(ctx);
    assert.equal(ctx.error, 'oops');
  });

  it('should prepend middleware', async () => {
    const chain = createMiddlewareChain();
    const ctx = { log: [] };

    chain.use(async (ctx, next) => { ctx.log.push('second'); await next(); });
    chain.prepend(async (ctx, next) => { ctx.log.push('first'); await next(); });

    await chain.execute(ctx);
    assert.deepEqual(ctx.log, ['first', 'second']);
  });

  it('should remove middleware', async () => {
    const chain = createMiddlewareChain();
    const ctx = { log: [] };
    const mw = async (ctx, next) => { ctx.log.push('removed'); await next(); };

    chain.use(mw);
    chain.use(async (ctx, next) => { ctx.log.push('kept'); await next(); });
    chain.remove(mw);

    await chain.execute(ctx);
    assert.deepEqual(ctx.log, ['kept']);
  });

  it('should return context from execute', async () => {
    const chain = createMiddlewareChain();
    chain.use(async (ctx, next) => { ctx.value = 42; await next(); });

    const result = await chain.execute({});
    assert.equal(result.value, 42);
  });

  it('should report length', () => {
    const chain = createMiddlewareChain();
    assert.equal(chain.length, 0);
    chain.use(async (ctx, next) => next());
    chain.use(async (ctx, next) => next());
    assert.equal(chain.length, 2);
  });

  it('should reject non-function middleware', () => {
    const chain = createMiddlewareChain();
    assert.throws(() => chain.use('not-a-function'));
    assert.throws(() => chain.prepend(42));
  });
});
