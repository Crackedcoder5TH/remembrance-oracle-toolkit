'use strict';
/**
 * trap-learner-cli.js — the print side of src/tools/trap-learner.js.
 *
 * `--do traps learn <json | json-file>` lands here (run.mjs invokes the
 * module as main, which delegates). The learner itself is a pure library;
 * scripts/ is where print is the job (console-ratchet).
 */
const fs = require('node:fs');
const { learn, LOCAL, REPEAT_TO_TRAP } = require('../src/tools/trap-learner');

function main(argv) {
  const arg = argv[0];
  if (!arg) { console.error('usage: trap-learner.js <json-file | json>'); return 2; }
  let traps;
  try { traps = JSON.parse(fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg); }
  catch (e) { console.error('not JSON: ' + e.message); return 2; }
  for (const trap of (Array.isArray(traps) ? traps : [traps])) {
    const r = learn(trap, REPEAT_TO_TRAP, 'agent');
    console.log(`[trap-learner] recorded "${r.key.slice(0, 80)}…" (count ${r.count}) → ${LOCAL}`);
  }
  return 0;
}

module.exports = { main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
