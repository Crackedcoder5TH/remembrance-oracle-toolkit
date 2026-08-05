// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
// JS placeholder pattern detection — extend completeness scorer
// to recognize `{ ... }` blocks (not just bare-line `...`).
if (/^\s*\.{3}\s*$/m.test(code) || /\{\s*\.{3}\s*\}/.test(code)) {
  score -= PLACEHOLDER_PENALTY;
}
