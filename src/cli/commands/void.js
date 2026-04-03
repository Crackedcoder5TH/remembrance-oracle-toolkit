/**
 * CLI commands for the Oracle-Void Bridge
 *
 * oracle void status   — show connection state
 * oracle void connect  — connect to void substrate
 * oracle void export   — feed oracle patterns to substrate (abundance flow)
 * oracle void score    — score a pattern with enhanced coherency
 * oracle void measure  — measure coherence of any file
 */

const path = require('path');
const fs = require('fs');

function registerVoidCommands(program, oracle) {
  const voidCmd = program.command('void').description('Void Compressor bridge');

  // oracle void status
  voidCmd.command('status')
    .description('Show Oracle-Void bridge connection status')
    .action(() => {
      const { VoidBridge } = require('../compression/void-bridge');
      const bridge = new VoidBridge(process.cwd());
      const status = bridge.getStatus();

      console.log('\nOracle-Void Bridge Status:\n');
      console.log(`  Mode: ${status.mode}`);
      console.log(`  Connected: ${status.connected}`);

      if (status.connected) {
        console.log(`  Substrate path: ${status.substratePath}`);
        console.log(`  Substrate patterns: ${status.substratePatterns.toLocaleString()}`);
        console.log(`  Substrate files: ${status.substrateFiles}`);
        console.log(`\n  Abundance: ${status.abundanceEquation}`);
      } else {
        console.log(`\n  The oracle is working standalone.`);
        console.log(`  To enhance with void substrate:`);
        console.log(`    oracle void connect <path-to-Void-Data-Compressor>`);
        console.log(`\n  ${status.abundanceEquation}`);
      }
    });

  // oracle void connect [path]
  voidCmd.command('connect [path]')
    .description('Connect to void substrate (enhances oracle)')
    .action((substratePath) => {
      const { VoidBridge } = require('../compression/void-bridge');
      const bridge = new VoidBridge(process.cwd());

      const searchPath = substratePath ||
        path.join(process.cwd(), '..', 'Void-Data-Compressor');

      const result = bridge.connect(searchPath);

      if (result.connected) {
        console.log('\n  Void substrate connected!\n');
        console.log(`  Patterns: ${result.patterns.toLocaleString()}`);
        console.log(`  Files: ${result.files}`);
        console.log(`  Mode: ${result.mode}`);
        console.log('\n  The oracle is now enhanced.');
        console.log('  Like the abundance equation: both systems benefit.');
      } else {
        console.log('\n  Could not connect to void substrate.');
        console.log(`  Searched: ${searchPath}`);
        console.log('  The oracle continues working standalone.');
      }
    });

  // oracle void export
  voidCmd.command('export')
    .description('Export oracle patterns to void substrate (abundance flow)')
    .action(() => {
      const { VoidBridge } = require('../compression/void-bridge');
      const bridge = new VoidBridge(process.cwd());

      if (!bridge.connected) {
        console.log('\n  No substrate connected. Connect first:');
        console.log('    oracle void connect');
        return;
      }

      const result = bridge.exportToSubstrate();
      console.log(`\n  ${result.message}`);
      console.log(`  Flow: ${result.abundanceFlow}`);
      console.log('\n  The oracle gave its patterns to the substrate.');
      console.log('  Both are now stronger.');
    });

  // oracle void measure <file>
  voidCmd.command('measure <file>')
    .description('Measure coherence of any file against the substrate')
    .action((file) => {
      const { VoidBridge } = require('../compression/void-bridge');
      const bridge = new VoidBridge(process.cwd());

      if (!fs.existsSync(file)) {
        console.log(`\n  File not found: ${file}`);
        return;
      }

      const code = fs.readFileSync(file, 'utf-8');
      const pattern = { code, name: path.basename(file) };
      const score = bridge.scoreCoherency(pattern);

      console.log(`\n  Coherence measurement: ${file}\n`);
      console.log(`  Mode: ${score.mode}`);
      console.log(`  Syntax: ${score.syntaxValid.toFixed(2)}`);
      console.log(`  Completeness: ${score.completeness.toFixed(2)}`);
      console.log(`  Test proof: ${score.testProof.toFixed(2)}`);
      console.log(`  Total (oracle): ${score.total.toFixed(3)}`);

      if (score.enhanced) {
        console.log(`\n  Substrate coherence: ${score.substrateCoherence.toFixed(3)}`);
        console.log(`  Pattern match: ${score.substratePatternMatch}`);
        console.log(`  Void wins: ${score.compressionAdvantage ? 'yes' : 'no'}`);
        console.log(`  Enhanced total: ${score.total.toFixed(3)}`);
      }
    });

  return voidCmd;
}

module.exports = { registerVoidCommands };
