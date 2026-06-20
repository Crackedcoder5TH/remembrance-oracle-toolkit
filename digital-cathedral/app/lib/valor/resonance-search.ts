/**
 * Lexical pattern-resonance for the marketplace search.
 *
 * The same signal the field's pattern_resonance uses — vocabulary overlap —
 * applied to lead records instead of code. As an agent types, each lead is
 * scored by how strongly its terms resonate with the query, and a partial word
 * still resonates with its completion ("tex" → "texas"): the "guess the word
 * you're spelling" behaviour, driven by resonance rather than a fixed dictionary.
 *
 * Pure and dependency-free, so it runs identically in the browser (live, on every
 * keystroke) and on the server.
 */

const TOKEN_RE = /[a-z0-9]+/g;

export function tokenize(s: string): string[] {
  return String(s || "").toLowerCase().match(TOKEN_RE) || [];
}

/**
 * How strongly `text` resonates with the typed `query`, in [0, 1]. Exact token
 * matches resonate fully; a partial word resonates with the term it is on its
 * way to spelling (prefix), and a contained fragment resonates weakly. Normalised
 * by query length, so the score is "what fraction of what I typed resonated".
 */
export function resonance(query: string, text: string): number {
  const q = tokenize(query);
  if (q.length === 0) return 0;
  const doc = new Set(tokenize(text));
  if (doc.size === 0) return 0;
  let hit = 0;
  for (const t of q) {
    if (doc.has(t)) { hit += 1; continue; }
    let best = 0;
    for (const d of doc) {
      if (d.startsWith(t) || t.startsWith(d)) { best = Math.max(best, 0.75); }
      else if (t.length >= 3 && d.includes(t)) { best = Math.max(best, 0.45); }
    }
    hit += best;
  }
  return Math.max(0, Math.min(1, hit / q.length));
}

/**
 * Suggest the vocabulary terms that resonate most with the last (possibly
 * partial) word being typed — the type-ahead completions. Skips terms already
 * present in the query.
 */
export function suggestTerms(query: string, vocab: readonly string[], k = 6): string[] {
  const toks = tokenize(query);
  const last = toks[toks.length - 1] || "";
  if (!last) return [];
  const already = new Set(toks);
  return vocab
    .map((term) => ({ term, score: resonance(last, term) }))
    .filter((x) => x.score > 0 && !already.has(x.term.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.term);
}
