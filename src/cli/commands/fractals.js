/**
 * Fractal CLI commands: fractal, fractal-analyze, fractal-engines
 * @oracle-infrastructure
 */

const fs = require('fs');
const { c, colorScore } = require('../colors');
const { parseTags } = require('../validate-args');

function registerFractalCommands(handlers, { oracle, getCode }) {

  handlers['fractal'] = (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Fractal System Commands:')}`);
      console.log(`  ${c.cyan('fractal analyze')}   [--file <f>]    Analyze code's fractal alignment`);
      console.log(`  ${c.cyan('fractal engines')}                   Show available fractal engines`);
      console.log(`  ${c.cyan('fractal resonance')} [--file <f>]    Find most resonant fractal for code`);
      console.log(`  ${c.cyan('fractal sierpinski')} --level <n>    Generate Sierpinski triangle data`);
      console.log(`  ${c.cyan('fractal mandelbrot')} --cr --ci      Test Mandelbrot point`);
      console.log(`  ${c.cyan('fractal julia')}     --cr --ci       Julia set stability map`);
      console.log(`  ${c.cyan('fractal lyapunov')}  --r <n>         Lyapunov exponent at r`);
      return;
    }

    // Lazy load to avoid startup cost
    const { computeFractalAlignment, selectResonantFractal, FRACTAL_TEMPLATES,
            sierpinski, mandelbrot, juliaStabilityMap, lyapunov, lyapunovSequence,
            barnsleyGrowthRate } = require('../../fractals');

    if (sub === 'analyze') {
      const code = getCode(args);
      if (!code) { console.error('Provide code via --file or stdin pipe.'); process.exit(1); }
      const result = computeFractalAlignment(code);

      console.log(`\n${c.bold('Fractal Alignment Analysis')}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`  ${c.bold('Composite:')}        ${colorScore(result.composite)}`);
      console.log(`  ${c.bold('Dominant Fractal:')} ${c.cyan(result.dominantFractal)}`);
      console.log('');
      console.log(`${c.bold('Dimensions:')}`);
      for (const [dim, val] of Object.entries(result.dimensions)) {
        const filled = Math.max(0, Math.min(20, Math.round(val * 20)));
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
        console.log(`  ${dim.padEnd(18)} ${bar} ${colorScore(val)}`);
      }
      console.log('');
      console.log(`${c.bold('Resonance Map:')}`);
      for (const [fractal, score] of Object.entries(result.resonanceMap)) {
        const tmpl = FRACTAL_TEMPLATES[fractal];
        console.log(`  ${c.cyan(fractal.padEnd(12))} ${colorScore(score)}  ${c.dim(tmpl.role.split('—')[0].trim())}`);
      }
      return;
    }

    if (sub === 'engines') {
      console.log(`\n${c.bold('Fractal Engines — 5 Mathematical Systems')}`);
      console.log(`${'─'.repeat(60)}`);
      for (const [key, tmpl] of Object.entries(FRACTAL_TEMPLATES)) {
        console.log(`  ${c.cyan(key.padEnd(12))} ${c.bold(tmpl.name)}`);
        console.log(`  ${''.padEnd(12)} ${tmpl.role}`);
        console.log(`  ${''.padEnd(12)} Signals: ${tmpl.codeSignals.join(', ')}`);
        console.log('');
      }
      return;
    }

    if (sub === 'resonance') {
      const code = getCode(args);
      if (!code) { console.error('Provide code via --file or stdin pipe.'); process.exit(1); }
      const desc = args.description || args._rest || '';
      const result = selectResonantFractal(code, desc);
      console.log(`\n${c.bold('Fractal Resonance Selection')}`);
      console.log(`  ${c.bold('Selected:')}  ${c.cyan(result.fractal)} (${result.template.name})`);
      console.log(`  ${c.bold('Resonance:')} ${colorScore(result.resonance)}`);
      console.log(`  ${c.bold('Reason:')}    ${result.reason}`);
      console.log(`  ${c.bold('Role:')}      ${result.template.role}`);
      return;
    }

    if (sub === 'sierpinski') {
      const level = parseInt(args.level || '5', 10);
      const result = sierpinski(level);
      console.log(`\n${c.bold('Sierpinski Triangle')} — Level ${level}`);
      console.log(`  Triangles:    ${c.cyan(String(result.triangles))}`);
      console.log(`  Filled ratio: ${colorScore(result.filledRatio)}`);
      console.log(`  Void ratio:   ${colorScore(result.voidRatio)}`);
      console.log(`  Vertices:     ${result.vertices.length} triangles generated`);
      return;
    }

    if (sub === 'mandelbrot') {
      const cr = parseFloat(args.cr || '-0.75');
      const ci = parseFloat(args.ci || '0.1');
      const maxIter = parseInt(args['max-iter'] || '100', 10);
      const result = mandelbrot(cr, ci, maxIter);
      console.log(`\n${c.bold('Mandelbrot Set')} — c = (${cr}, ${ci}i)`);
      console.log(`  In set:       ${result.inSet ? c.green('YES') : c.red('NO')}`);
      console.log(`  Iterations:   ${c.cyan(String(result.iterations))} / ${maxIter}`);
      console.log(`  Magnitude:    ${result.magnitude.toFixed(6)}`);
      console.log(`  Escape speed: ${colorScore(result.escapeSpeed)}`);
      return;
    }

    if (sub === 'julia') {
      const cr = parseFloat(args.cr || '-0.7');
      const ci = parseFloat(args.ci || '0.27015');
      const result = juliaStabilityMap(cr, ci);
      console.log(`\n${c.bold('Julia Set Stability Map')} — c = (${cr}, ${ci}i)`);
      console.log(`  Avg stability:    ${colorScore(result.avgStability)}`);
      console.log(`  Boundary density: ${colorScore(result.boundaryDensity)}`);
      console.log(`  Connected ratio:  ${colorScore(result.connectedRatio)}`);
      return;
    }

    if (sub === 'lyapunov') {
      const r = parseFloat(args.r || '3.57');
      const seq = args.sequence || null;
      if (seq) {
        const rA = parseFloat(args.rA || args.r || '3.5');
        const rB = parseFloat(args.rB || '3.8');
        const result = lyapunovSequence(seq, rA, rB);
        console.log(`\n${c.bold('Lyapunov Sequence')} — "${seq}" (rA=${rA}, rB=${rB})`);
        console.log(`  Exponent: ${result.exponent.toFixed(6)}`);
        console.log(`  State:    ${result.isOrdered ? c.green('ORDERED') : c.red('CHAOTIC')}`);
      } else {
        const result = lyapunov(r);
        console.log(`\n${c.bold('Lyapunov Exponent')} — r = ${r}`);
        console.log(`  Exponent:  ${result.exponent.toFixed(6)}`);
        console.log(`  State:     ${result.isOrdered ? c.green('ORDERED') : c.red('CHAOTIC')}`);
        console.log(`  Stability: ${colorScore(result.stability)}`);
      }
      return;
    }

    console.error(`Unknown fractal sub-command: ${sub}. Run ${c.cyan('oracle fractal help')}`);
  };
}

module.exports = { registerFractalCommands };
