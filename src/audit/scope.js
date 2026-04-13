'use strict';

/**
 * Scope-aware null-check tracking for the audit checker.
 *
 * Given a flat token stream (inside a function body), we compute for every
 * token position which identifiers are known to be non-null at that point.
 * A variable becomes non-null after a guard like:
 *
 *   if (x)              ...  → x is non-null inside the `if` block
 *   if (x != null)      ...
 *   if (x !== null)     ...
 *   if (x !== undefined)...
 *   if (x)              return; → x is NULL on the path that follows
 *                                (because the true branch returned)
 *   x = foo() || bar;   ...  → x is non-null after this line
 *   x = foo() ?? 'default'; ...
 *   x ??= something;
 *
 * This is intentionally a shallow flow analysis: we track boolean non-null
 * facts across brace-delimited blocks within a function. Loops and complex
 * control flow drop facts conservatively.
 *
 * The scope tracker is a walker that emits per-token snapshots of
 * `nonNullAt(tokenIdx)` → Set<varName>. The checkers query this to decide
 * whether an access needs a finding.
 */

/**
 * Build a per-token non-null set for a function body.
 *
 * @param {Array} tokens - bodyTokens (no comments)
 * @returns {{ nonNullAt: (idx: number) => Set<string> }}
 */
function buildScope(tokens) {
  // Pre-compute block boundaries so we know where an `if (x)` guard applies.
  // We scan left-to-right, maintaining a stack of scopes. Each scope has:
  //   - nonNull: Set<string>
  //   - closeAt: tokenIdx where the scope ends (inclusive)
  // When we encounter `if (condition) {`, we enter a new scope whose nonNull
  // is derived from the condition. When we encounter the matching `}`, we
  // pop. When we see `return` / `throw` inside an `if (!x)` block, we
  // propagate a "x is non-null" fact to the outer scope after the block.

  const n = tokens.length;
  // snapshots[i] = Set<string> of non-null idents at token i
  const snapshots = new Array(n);

  /** Scope frame: {nonNull, closeAt, onExitPromote?: string} */
  const stack = [{ nonNull: new Set(), closeAt: n, onExitPromote: null }];

  function currentNonNull() {
    return stack[stack.length - 1].nonNull;
  }

  function pushScope(frame) { stack.push(frame); }
  function popScope() {
    const frame = stack.pop();
    // If the block guaranteed an early-exit (return/throw) inside an
    // `if (!x)` guard, then x is non-null in the continuation of the
    // enclosing scope.
    if (frame.onExitPromote && frame.earlyExit) {
      const parent = stack[stack.length - 1];
      if (parent) parent.nonNull.add(frame.onExitPromote);
    }
  }

  for (let i = 0; i < n; i++) {
    // Pop scopes whose closing brace we've reached
    while (stack.length > 1 && i >= stack[stack.length - 1].closeAt) {
      popScope();
    }

    const t = tokens[i];
    snapshots[i] = new Set(currentNonNull());

    // Early exit detection inside current scope
    if (t.type === 'keyword' && (t.value === 'return' || t.value === 'throw')) {
      stack[stack.length - 1].earlyExit = true;
    }

    // Detect `if (` pattern starting a guarded block
    if (t.type === 'keyword' && t.value === 'if' && tokens[i + 1]?.value === '(') {
      const parseResult = parseIfHeader(tokens, i);
      if (parseResult) {
        const { conditionTokens, closeParenIdx, bodyIsBlock, bodyOpenIdx, bodyCloseIdx } = parseResult;
        const guard = analyzeCondition(conditionTokens);
        if (bodyIsBlock) {
          // Enter a new scope for the if-body
          const childNonNull = new Set(currentNonNull());
          for (const v of guard.trueBranch) childNonNull.add(v);
          pushScope({
            nonNull: childNonNull,
            closeAt: bodyCloseIdx + 1,
            onExitPromote: guard.negated && guard.negated.length > 0 ? guard.negated[0] : null,
            earlyExit: false,
          });
          // Skip forward to the body open so we don't double-process condition
          i = bodyOpenIdx;
          continue;
        }
        // Single-statement if (no braces). This is the classic guard clause:
        //   if (!x) return null;
        //   if (!x) throw new Error();
        //   if (!x) continue;
        // When the single statement is an early exit, we can promote the
        // negated variables to non-null in the continuation of the current
        // scope — no new scope frame needed.
        const stmtIsEarlyExit = isSingleStmtEarlyExit(tokens, closeParenIdx + 1);
        if (stmtIsEarlyExit && guard.negated && guard.negated.length > 0) {
          for (const v of guard.negated) currentNonNull().add(v);
        }
        // Similarly: if (x == null) return; → x is still null afterwards,
        // and if (x != null) { use(x); } already handled by the block path.
      }
    }

    // Detect `const x = foo() || somethingNonNull;` → x is non-null
    if (t.type === 'keyword' && (t.value === 'const' || t.value === 'let' || t.value === 'var')) {
      const nameTok = tokens[i + 1];
      if (nameTok?.type === 'identifier') {
        const eq = tokens[i + 2];
        if (eq?.value === '=') {
          // Scan until ; or newline for non-null indicators
          let j = i + 3;
          let depth = 0;
          let hasOr = false;
          let hasNullishCoalesce = false;
          let hasLiteralFallback = false;
          while (j < n) {
            const tk = tokens[j];
            if (depth === 0 && (tk.value === ';' || tk.value === ',')) break;
            if (tk.value === '(' || tk.value === '[' || tk.value === '{') depth++;
            if (tk.value === ')' || tk.value === ']' || tk.value === '}') depth--;
            if (depth === 0 && tk.value === '||') hasOr = true;
            if (depth === 0 && tk.value === '??') hasNullishCoalesce = true;
            if ((hasOr || hasNullishCoalesce) && (tk.type === 'string' || tk.type === 'number' ||
                tk.value === 'true' || tk.value === 'false' ||
                (tk.value === '{' && tokens[j + 1]?.value === '}') ||
                (tk.value === '[' && tokens[j + 1]?.value === ']'))) {
              hasLiteralFallback = true;
            }
            j++;
          }
          if ((hasOr || hasNullishCoalesce) && hasLiteralFallback) {
            currentNonNull().add(nameTok.value);
          }
        }
      }
    }
  }

  // Drain any remaining scopes
  while (stack.length > 1) popScope();

  return {
    nonNullAt(idx) {
      if (idx < 0 || idx >= n) return new Set();
      return snapshots[idx] || new Set();
    },
  };
}

/**
 * Parse the header of an `if` statement starting at tokens[i] where
 * tokens[i].value === 'if'. Returns condition token range and body range.
 */
function parseIfHeader(tokens, i) {
  // tokens[i] = 'if', tokens[i+1] = '('
  let j = i + 2;
  let depth = 1;
  const conditionStart = j;
  while (j < tokens.length && depth > 0) {
    if (tokens[j].value === '(') depth++;
    else if (tokens[j].value === ')') { depth--; if (depth === 0) break; }
    j++;
  }
  if (j >= tokens.length) return null;
  const closeParenIdx = j;
  const conditionTokens = tokens.slice(conditionStart, closeParenIdx);
  const bodyStart = j + 1;
  if (tokens[bodyStart]?.value !== '{') {
    // single-statement if — we don't enter a new scope for these
    return {
      conditionTokens,
      closeParenIdx,
      bodyIsBlock: false,
      bodyOpenIdx: bodyStart,
      bodyCloseIdx: bodyStart,
    };
  }
  // Find matching }
  let k = bodyStart + 1;
  depth = 1;
  while (k < tokens.length && depth > 0) {
    if (tokens[k].value === '{') depth++;
    else if (tokens[k].value === '}') { depth--; if (depth === 0) break; }
    k++;
  }
  return {
    conditionTokens,
    closeParenIdx,
    bodyIsBlock: true,
    bodyOpenIdx: bodyStart,
    bodyCloseIdx: k,
  };
}

/**
 * Analyze a condition's tokens to figure out which variables are non-null
 * in the true branch and which are null on the exit path.
 *
 *   if (x)             → true: {x}
 *   if (x != null)     → true: {x}
 *   if (x !== null)    → true: {x}
 *   if (x !== undefined) → true: {x}
 *   if (x && x.y)      → true: {x}  (conservative)
 *   if (!x)            → negated: [x]  (x is non-null in the FALSE branch)
 *
 * Returns { trueBranch: string[], negated: string[] }
 */
function analyzeCondition(tokens) {
  const trueBranch = [];
  const negated = [];

  // Strip surrounding parens
  let toks = tokens;
  while (toks.length >= 2 && toks[0].value === '(' && toks[toks.length - 1].value === ')') {
    toks = toks.slice(1, -1);
  }

  // Pattern: single identifier
  if (toks.length === 1 && toks[0].type === 'identifier') {
    trueBranch.push(toks[0].value);
    return { trueBranch, negated };
  }

  // Pattern: !x (negation)
  if (toks.length === 2 && toks[0].value === '!' && toks[1].type === 'identifier') {
    negated.push(toks[1].value);
    return { trueBranch, negated };
  }

  // Pattern: x != null, x !== null, x !== undefined (and the == variants)
  if (toks.length >= 3 && toks[0].type === 'identifier') {
    const op = toks[1].value;
    const right = toks[2];
    if (['!=', '!=='].includes(op) && (right.value === 'null' || right.value === 'undefined')) {
      trueBranch.push(toks[0].value);
      return { trueBranch, negated };
    }
    if (['==', '==='].includes(op) && (right.value === 'null' || right.value === 'undefined')) {
      negated.push(toks[0].value);
      return { trueBranch, negated };
    }
  }

  // Pattern: typeof x !== 'undefined'
  if (toks[0]?.value === 'typeof' && toks[1]?.type === 'identifier' &&
      ['!==', '!='].includes(toks[2]?.value) &&
      toks[3]?.type === 'string' && /['"]undefined['"]/.test(toks[3].value)) {
    trueBranch.push(toks[1].value);
    return { trueBranch, negated };
  }

  // Pattern: x && y → split on && and recurse
  const andParts = splitTopLevel(toks, '&&');
  if (andParts.length > 1) {
    for (const part of andParts) {
      const sub = analyzeCondition(part);
      for (const v of sub.trueBranch) trueBranch.push(v);
      for (const v of sub.negated) negated.push(v);
    }
  }

  return { trueBranch, negated };
}

/**
 * Is the token at `start` the head of a single-statement early-exit?
 * Recognizes: return (with optional value), throw, continue, break.
 * We scan until `;` or newline; we don't need to understand the value.
 */
function isSingleStmtEarlyExit(tokens, start) {
  const t = tokens[start];
  if (!t) return false;
  if (t.type === 'keyword' && (t.value === 'return' || t.value === 'throw' ||
      t.value === 'continue' || t.value === 'break')) {
    return true;
  }
  // Also accept `{ return ... }` single-line blocks
  if (t.value === '{') {
    const next = tokens[start + 1];
    if (next?.type === 'keyword' && (next.value === 'return' || next.value === 'throw' ||
        next.value === 'continue' || next.value === 'break')) {
      return true;
    }
  }
  return false;
}

function splitTopLevel(tokens, op) {
  const parts = [];
  let current = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
    if (t.value === ')' || t.value === ']' || t.value === '}') depth--;
    if (depth === 0 && t.value === op) {
      parts.push(current);
      current = [];
      continue;
    }
    current.push(t);
  }
  if (current.length) parts.push(current);
  return parts;
}

module.exports = {
  buildScope,
  analyzeCondition,
};
