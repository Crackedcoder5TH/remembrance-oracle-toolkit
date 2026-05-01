/**
 * Reasoning CLI commands: reason, deep-concepts
 *
 * Exposes the Abstract Reasoning Engine — the "what does this mean"
 * layer that sits above cascade correlation. Takes pattern pairs or
 * cascade output and produces analogies, metaphors, conceptual
 * bridges, and identity declarations.
 *
 * @oracle-infrastructure
 */

const { c } = require('../colors');

function registerReasoningCommands(handlers, { oracle }) {

  handlers['reason'] = (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Abstract Reasoning Commands:')}`);
      console.log(`  ${c.cyan('reason between')} --a <name> --b <name> --corr <0.0-1.0>  Reason about two patterns`);
      console.log(`  ${c.cyan('reason cascade')} --pattern <name>                          Reason from cascade output`);
      console.log(`  ${c.cyan('reason concepts')}                                          List the deep concept primitives`);
      console.log(``);
      console.log(`${c.dim('Levels of understanding produced:')}`);
      console.log(`  ${c.dim('• analogy   — "A is like B" (corr ≥ 0.30)')}`);
      console.log(`  ${c.dim('• metaphor  — structural mapping (≥ 2 strong correlations per domain)')}`);
      console.log(`  ${c.dim('• bridge    — shared deep concept (corr ≥ 0.50)')}`);
      console.log(`  ${c.dim('• identity  — same essence in different media (corr ≥ 0.70 + concept ≥ 3 domains)')}`);
      return;
    }

    const { reason, findAnalogy, buildMetaphor, findConceptualBridge,
            detectIdentity, DEEP_CONCEPTS } =
      require('../../core/abstract-reasoning');

    if (sub === 'concepts') {
      console.log(`${c.bold('Deep Concept Primitives:')}\n`);
      for (const [conceptId, concept] of Object.entries(DEEP_CONCEPTS)) {
        const universality = Object.keys(concept.manifests_as).length;
        console.log(`  ${c.cyan(conceptId)}  ${c.dim('(spans ' + universality + ' domains)')}`);
        console.log(`    essence: ${concept.essence}`);
        console.log(`    domains: ${Object.keys(concept.manifests_as).join(', ')}`);
        console.log('');
      }
      return;
    }

    if (sub === 'between') {
      const a = args.a;
      const b = args.b;
      const corr = parseFloat(args.corr || 0);
      if (!a || !b) {
        console.error(`${c.red('error:')} --a and --b required`);
        return;
      }

      const patternA = { name: a, domain: a.split('/')[0], tags: [] };
      const patternB = { name: b, domain: b.split('/')[0], tags: [] };

      const result = {
        analogy:  findAnalogy(patternA, patternB, corr),
        bridge:   findConceptualBridge(patternA, patternB, corr),
        identity: detectIdentity(patternA, patternB, corr),
      };

      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`${c.bold('Reasoning between')} ${c.cyan(a)} ${c.dim('↔')} ${c.cyan(b)}  ${c.dim('(corr=' + corr.toFixed(3) + ')')}\n`);

      if (result.analogy) {
        console.log(`  ${c.green('analogy')}: ${result.analogy.statement}`);
        if (result.analogy.deepConcepts.length > 0) {
          console.log(`    via: ${result.analogy.deepConcepts.map(c => c.essence).join('; ')}`);
        }
      }
      if (result.bridge && result.bridge.essence) {
        console.log(`  ${c.green('bridge')}:  ${result.bridge.statement}`);
        console.log(`    universality: spans ${result.bridge.universality} domains`);
      }
      if (result.identity) {
        console.log(`  ${c.green('IDENTITY')}: ${result.identity.declaration}`);
        console.log(`    essence: ${result.identity.essence}`);
        for (const r of result.identity.reasoning.slice(0, 5)) {
          console.log(`    · ${c.dim(r)}`);
        }
      } else {
        console.log(`  ${c.dim('(no identity claim — needs corr >= 0.70 and concept spanning >= 3 domains)')}`);
      }
      return;
    }

    if (sub === 'cascade') {
      const patternName = args.pattern;
      if (!patternName) {
        console.error(`${c.red('error:')} --pattern required`);
        return;
      }
      // For now, take cascade matches from stdin or a fixture
      let cascadeMatches = [];
      if (args.matches) {
        try { cascadeMatches = JSON.parse(args.matches); }
        catch (e) {
          console.error(`${c.red('error:')} --matches must be JSON array of {domain, correlation, type}`);
          return;
        }
      } else {
        console.error(`${c.red('error:')} --matches required (JSON array from cascade output)`);
        console.error(`  example: --matches '[{"domain":"physics","correlation":0.95,"type":"resonant"}]'`);
        return;
      }
      const sourcePattern = { name: patternName, domain: patternName.split('/')[0] };
      const result = reason(cascadeMatches, sourcePattern);

      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`${c.bold('Reasoning cascade for')} ${c.cyan(patternName)}\n`);
      console.log(`  levels reached: analogies=${result.levelsReached.analogies}, ` +
                   `metaphors=${result.levelsReached.metaphors}, ` +
                   `bridges=${result.levelsReached.bridges}, ` +
                   `identities=${result.levelsReached.identities}`);
      if (result.deepestInsight) {
        console.log(`\n  ${c.green('deepest insight')} (${result.deepestInsight.level}):`);
        console.log(`    ${result.deepestInsight.insight}`);
      }
      console.log(`\n  ${c.dim('wall time: ' + result.durationMs + 'ms')}`);
      return;
    }

    console.error(`${c.red('error:')} unknown subcommand: ${sub}`);
  };

}

module.exports = { registerReasoningCommands };
