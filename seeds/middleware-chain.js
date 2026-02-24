/**
 * Middleware Chain — Generic pipeline for request/response or data processing.
 * Each middleware is (context, next) => result. Call next() to pass to the next layer.
 * Supports: use, prepend, remove, execute, error middleware.
 */
function createMiddlewareChain() {
  const stack = [];
  const errorHandlers = [];

  function use(fn) {
    if (typeof fn !== 'function') throw new Error('Middleware must be a function');
    stack.push(fn);
    return chain;
  }

  function prepend(fn) {
    if (typeof fn !== 'function') throw new Error('Middleware must be a function');
    stack.unshift(fn);
    return chain;
  }

  function onError(fn) {
    if (typeof fn !== 'function') throw new Error('Error handler must be a function');
    errorHandlers.push(fn);
    return chain;
  }

  function remove(fn) {
    const idx = stack.indexOf(fn);
    if (idx >= 0) stack.splice(idx, 1);
    return chain;
  }

  async function execute(context) {
    let index = 0;

    async function next() {
      if (index >= stack.length) return;
      const middleware = stack[index++];
      try {
        await middleware(context, next);
      } catch (err) {
        if (errorHandlers.length > 0) {
          for (const handler of errorHandlers) {
            await handler(err, context, next);
          }
        } else {
          throw err;
        }
      }
    }

    await next();
    return context;
  }

  const chain = {
    use,
    prepend,
    onError,
    remove,
    execute,
    get length() { return stack.length; },
  };

  return chain;
}

module.exports = { createMiddlewareChain };
