'use strict';

/**
 * Nullable return type inference.
 *
 * For each function in the program, determine whether it can return
 * `null`/`undefined`. A function is nullable iff any of these hold:
 *
 *   1. It has an explicit `return null` or `return undefined`
 *   2. It has an implicit return (falls off end) and no explicit value returns
 *   3. It has a bare `return;`
 *   4. It's declared but has no body we can see (conservative: nullable)
 *
 * A function is non-nullable iff EVERY explicit return statement returns a
 * value and the function always terminates via return or throw.
 *
 * We also expose a call-site check: does the caller null-check the result
 * before dereferencing? That's handled by the integration checker, but the
 * type inference module supplies the list of nullable callees.
 *
 * Intra-file only. Cross-file propagation is handled by call-graph.js.
 */

const { walkFunctions } = require('./parser');

/**
 * Analyze a parsed program and return a map:
 *   { functions: Map<name, { nullable: bool, returns: Return[], node }> }
 *
 * Only named functions are indexed; anonymous expressions get a synthetic
 * key based on their byte offset so the cascade detector can reference them.
 */
function inferNullability(program) {
  // Track every definition per name so we can detect ambiguity.
  // When two functions share a name (inner helper + class method,
  // nested scopes, forked paths), we can't know which one a given
  // call site resolves to without full scope analysis. Rather than
  // risk a false positive, we mark the name as ambiguous and the
  // integration checker skips call-site nullability checks for it.
  const byName = new Map(); // name → DefRecord[]
  walkFunctions(program, (fn) => {
    if (!fn.name) return;
    const nullable = computeNullable(fn);
    const record = {
      name: fn.name,
      nullable,
      returns: fn.returns,
      line: fn.line,
      column: fn.column,
      node: fn,
    };
    if (!byName.has(fn.name)) byName.set(fn.name, [record]);
    else byName.get(fn.name).push(record);
  });

  // Build the final map the integration checker consumes. For
  // ambiguous names we mark the entry as `ambiguous: true` and set
  // nullable=false so the checker skips them (err on silence rather
  // than false positives). For unambiguous names we expose the
  // single record as-is.
  const functions = new Map();
  for (const [name, records] of byName.entries()) {
    if (records.length === 1) {
      functions.set(name, records[0]);
    } else {
      // Same-name shadowing: first definition wins for stats, but we
      // mark the entry ambiguous so integration/nullable-deref skips it.
      functions.set(name, {
        ...records[0],
        ambiguous: true,
        nullable: false, // conservative: don't flag call sites
        alternates: records.slice(1),
      });
    }
  }

  return { functions };
}

/**
 * Decide whether a single function is nullable.
 */
function computeNullable(fn) {
  const returns = fn.returns || [];
  if (returns.length === 0) return true; // empty body → undefined
  // An implicit-return (function never explicitly returns) is nullable.
  if (returns.some(r => r.kind === 'implicit')) return true;
  // Any explicit null/undefined return makes it nullable.
  if (returns.some(r => r.kind === 'null' || r.kind === 'undefined')) return true;
  return false;
}

/**
 * Merge nullability info from multiple files (for cross-file analysis).
 *
 * @param {Array<ReturnType<inferNullability>>} perFile
 * @returns {Map<name, {nullable,node}>}
 */
function mergeProjectNullability(perFile) {
  const merged = new Map();
  for (const file of perFile) {
    for (const [name, info] of file.functions.entries()) {
      // If the same name exists in multiple files, use the first but also
      // track that it's ambiguous — conservative: nullable if ANY definition
      // is nullable.
      const existing = merged.get(name);
      if (!existing) {
        merged.set(name, { ...info });
      } else if (info.nullable) {
        existing.nullable = true;
      }
    }
  }
  return merged;
}

module.exports = {
  inferNullability,
  mergeProjectNullability,
  computeNullable,
};
