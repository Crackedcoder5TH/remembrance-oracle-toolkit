// UPPER_CASE skip-guard: re-enabling a code transform that's safe for
// function params / locals but unsafe for const literals (TS treats
// `LIMIT === 0` as impossible-comparison). Skip when identifier looks
// like a SCREAMING_SNAKE_CASE constant.
const divisorHead = divisorName.split('.')[0];
if (/^[A-Z_][A-Z0-9_]*$/.test(divisorHead)) return null;
return patchDivisionGuard(finding, source, program);
