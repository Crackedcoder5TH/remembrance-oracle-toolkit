'use strict';

const { out, outErr, outWarn, _quiet } = require('./out');
const { c } = require('../../colors');

// The audit dispatcher — routes subcommands to the three audit organs.
// Sub-organs are required at call time so the CLI loads no audit code
// until the audit command actually runs.
function registerAuditCommands(handlers, ctx) {
  handlers['audit'] = (args) => {
    const sub = args._sub;

    // Subcommand: audit check — run static checkers on files
    if (sub === 'check') return require('./audit-run')._check(args, ctx);
    if (sub === 'cascade') return require('./audit-run')._cascade(args, ctx);
    if (sub === 'summary') return require('./audit-report')._summary(args, ctx);
    if (sub === 'cross-file' || sub === 'crossfile') return require('./audit-report')._crossFile(args, ctx);
    if (sub === 'baseline') return require('./audit-meta')._baseline(args, ctx);
    if (sub === 'explain') return require('./audit-meta')._explain(args, ctx);
    if (sub === 'feedback') return require('./audit-meta')._feedback(args, ctx);
    if (sub === 'prior') return require('./audit-meta')._prior(args, ctx);
    if (sub === 'prior-promote' || sub === 'promote-prior') return require('./audit-meta')._priorPromote(args, ctx);
    if (sub === 'xref') return require('./audit-meta')._xref(args, ctx);
    if (sub === 'log') return require('./audit-meta')._log(args, ctx);


    outErr(c.boldRed('Error:') + ` Unknown audit subcommand: ${sub}. Run ${c.cyan('oracle audit')} for help.`);
  };
}
registerAuditCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerAuditCommands };
