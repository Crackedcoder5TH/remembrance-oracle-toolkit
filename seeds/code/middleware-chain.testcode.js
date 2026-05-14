// Test: middleware-chain — inline assertions, no require

// Length tracking (sync)
const chainSync = createMiddlewareChain();
chainSync.use(async (ctx, next) => next());
chainSync.use(async (ctx, next) => next());
if (chainSync.length !== 2) throw new Error('Length should be 2');

// Async tests wrapped
(async () => {
  // Execute in order
  const chain1 = createMiddlewareChain();
  const ctx1 = { log: [] };
  chain1.use(async (ctx, next) => { ctx.log.push('a'); await next(); });
  chain1.use(async (ctx, next) => { ctx.log.push('b'); await next(); });
  chain1.use(async (ctx, next) => { ctx.log.push('c'); await next(); });
  await chain1.execute(ctx1);
  if (JSON.stringify(ctx1.log) !== '["a","b","c"]') throw new Error('Order wrong: ' + JSON.stringify(ctx1.log));

  // Onion-style wrapping
  const chain2 = createMiddlewareChain();
  const ctx2 = { log: [] };
  chain2.use(async (ctx, next) => { ctx.log.push('a-before'); await next(); ctx.log.push('a-after'); });
  chain2.use(async (ctx, next) => { ctx.log.push('b-before'); await next(); ctx.log.push('b-after'); });
  await chain2.execute(ctx2);
  if (JSON.stringify(ctx2.log) !== '["a-before","b-before","b-after","a-after"]') throw new Error('Onion wrong');

  // Stop without next
  const chain3 = createMiddlewareChain();
  const ctx3 = { log: [] };
  chain3.use(async (ctx) => { ctx.log.push('a'); });
  chain3.use(async (ctx, next) => { ctx.log.push('b'); await next(); });
  await chain3.execute(ctx3);
  if (ctx3.log.length !== 1 || ctx3.log[0] !== 'a') throw new Error('Should stop without next');

  // Error propagation
  const chain4 = createMiddlewareChain();
  let errCaught = false;
  chain4.use(async () => { throw new Error('mw-error'); });
  try { await chain4.execute({}); } catch(e) { if (e.message === 'mw-error') errCaught = true; }
  if (!errCaught) throw new Error('Should propagate error');

  // Error handler
  const chain5 = createMiddlewareChain();
  const ctx5 = { error: null };
  chain5.use(async () => { throw new Error('oops'); });
  chain5.onError(async (err, ctx) => { ctx.error = err.message; });
  await chain5.execute(ctx5);
  if (ctx5.error !== 'oops') throw new Error('Error handler failed');

  // Prepend
  const chain6 = createMiddlewareChain();
  const ctx6 = { log: [] };
  chain6.use(async (ctx, next) => { ctx.log.push('second'); await next(); });
  chain6.prepend(async (ctx, next) => { ctx.log.push('first'); await next(); });
  await chain6.execute(ctx6);
  if (ctx6.log[0] !== 'first') throw new Error('Prepend failed');
})().catch(e => { console.error(e); process.exit(1); });
