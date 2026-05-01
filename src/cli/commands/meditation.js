/**
 * Meditation CLI commands: meditate, meditate-status, meditate-once
 *
 * Exposes the Meditation Engine — the Oracle's self-directed
 * improvement loop. When idle, the Oracle uses its own tools on
 * itself: self-reflection, consolidation, synthetic exploration,
 * cross-domain synthesis, coherency optimization, prophecy, meta-loop.
 *
 * Built-in safety: meditation has its own monotone-coherency veto
 * (refuses any session whose post-benchmark < pre-benchmark) plus
 * a high-water-mark floor + per-activity veto memory + interruptible
 * cycles. Aligned with the substrate's coherency-as-method discipline.
 *
 * @oracle-infrastructure
 */

const { c } = require('../colors');

let _engine = null;

function _getEngine(oracle) {
  if (_engine) return _engine;
  const { MeditationEngine } = require('../../core/meditation');
  _engine = new MeditationEngine(oracle);
  return _engine;
}

function registerMeditationCommands(handlers, { oracle }) {

  handlers['meditate'] = async (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Meditation Engine Commands:')}`);
      console.log(`  ${c.cyan('meditate once')}                  Run a single meditation session now`);
      console.log(`  ${c.cyan('meditate start')}                 Begin background idle-monitoring`);
      console.log(`  ${c.cyan('meditate stop')}                  Halt the engine`);
      console.log(`  ${c.cyan('meditate status')}                Current state + cycle counts`);
      console.log(`  ${c.cyan('meditate touch')}                 Signal user activity (resets idle timer)`);
      console.log(``);
      console.log(`${c.dim('7 activities run cyclically:')}`);
      console.log(`  ${c.dim('1. self-reflection           — find unexplored connections')}`);
      console.log(`  ${c.dim('2. consolidation             — merge redundant, archive unused')}`);
      console.log(`  ${c.dim('3. synthetic-exploration     — generate hypothetical patterns')}`);
      console.log(`  ${c.dim('4. cross-domain-synthesis    — discover universal principles')}`);
      console.log(`  ${c.dim('5. coherency-optimization    — reorganize for compression')}`);
      console.log(`  ${c.dim('6. prophecy                  — project patterns forward')}`);
      console.log(`  ${c.dim('7. meta-loop                 — system observing system')}`);
      console.log(``);
      console.log(`${c.dim('Built-in monotone-coherency veto: any session whose post-benchmark')}`);
      console.log(`${c.dim('< pre-benchmark is rolled back. Same discipline as the substrate.')}`);
      return;
    }

    const engine = _getEngine(oracle);

    if (sub === 'once') {
      console.log(`${c.dim('Running single meditation session...')}`);
      try {
        const result = await engine.meditateSingle();
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result) {
          console.log(`\n${c.bold('Session:')} ${result.sessionId || 'n/a'}`);
          if (result.coherencyDelta !== undefined) {
            const sign = result.coherencyDelta >= 0 ? '+' : '';
            const colour = result.coherencyDelta >= 0 ? c.green : c.red;
            console.log(`  ${c.bold('benchmark delta:')} ${colour(sign + result.coherencyDelta.toFixed(4))}`);
          }
          if (result.vetoed) {
            console.log(`  ${c.yellow('VETOED:')} ${result.vetoReason || 'post-benchmark < pre-benchmark'}`);
          }
          if (result.whisper) {
            console.log(`  ${c.dim('whisper:')} ${result.whisper}`);
          }
          console.log(`  ${c.dim('cycles completed: ' + (result.cyclesCompleted || 0))}`);
        } else {
          console.log(`${c.dim('Meditation complete (no result returned).')}`);
        }
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    if (sub === 'start') {
      engine.start();
      console.log(`${c.green('✓')} meditation engine started (idle threshold: ${engine.status().config.idleThreshold / 1000}s)`);
      // Don't block — engine schedules its own checks via timer.unref()
      return;
    }

    if (sub === 'stop') {
      engine.stop();
      console.log(`${c.green('✓')} meditation engine stopped`);
      return;
    }

    if (sub === 'status') {
      const status = engine.status();
      if (args.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      console.log(`${c.bold('Meditation Engine Status')}`);
      console.log(`  state:           ${c.cyan(status.state)}`);
      console.log(`  session:         ${status.sessionId || c.dim('(none)')}`);
      console.log(`  cycles:          ${status.cyclesCompleted}`);
      console.log(`  last activity:   ${status.lastActivity}`);
      console.log(`  idle for:        ${(status.idleDuration / 1000).toFixed(1)}s`);
      console.log(`  journal entries: ${status.journalEntries}`);
      console.log(`  config:          enabled=${status.config.enabled}, idle=${status.config.idleThreshold/1000}s, max-cycles=${status.config.maxCycles}`);
      return;
    }

    if (sub === 'touch') {
      engine.touch();
      console.log(`${c.green('✓')} activity signaled — idle timer reset`);
      return;
    }

    console.error(`${c.red('error:')} unknown subcommand: ${sub}`);
  };

}

module.exports = { registerMeditationCommands };
