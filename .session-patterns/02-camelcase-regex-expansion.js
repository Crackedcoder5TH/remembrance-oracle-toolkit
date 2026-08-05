// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
// camelCase / snake_case identifier expansion before \b regex matching.
// Insert spaces at lowercase→uppercase transitions and replace underscores
// so `clinicalDiagnosis` and `legal_advice` trip identifier-word boundaries.
const expanded = code.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
if (patterns.claim.test(expanded)) { /* flag */ }
