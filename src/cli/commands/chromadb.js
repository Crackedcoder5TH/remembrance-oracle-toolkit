'use strict';

/**
 * ChromaDB CLI commands: chromadb sync, chromadb search, chromadb resolve, chromadb stats
 */

const { c, colorScore, colorDecision } = require('../colors');

function registerChromaDBCommands(handlers, { oracle }) {

  handlers['chromadb'] = async (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`\n${c.boldCyan('ChromaDB Semantic Search Engine')}\n`);
      console.log(`  ${c.cyan('chromadb sync')}       Sync all patterns from SQLite → ChromaDB`);
      console.log(`  ${c.cyan('chromadb search')}     Semantic search (384D sentence-transformers)`);
      console.log(`  ${c.cyan('chromadb resolve')}    Smart PULL/EVOLVE/GENERATE decision`);
      console.log(`  ${c.cyan('chromadb stats')}      Engine statistics`);
      console.log(`  ${c.cyan('chromadb tier')}       Detect and show active embedding tier`);
      console.log();
      return;
    }

    const { ChromaDBBridge } = require('../../search/chromadb/bridge');
    const bridge = new ChromaDBBridge();

    if (sub === 'sync') {
      console.log(`${c.boldCyan('Syncing patterns to ChromaDB...')}`);

      // Get all patterns from SQLite
      const allPatterns = oracle.patterns.getAll({});
      if (!allPatterns || allPatterns.length === 0) {
        console.log(c.yellow('No patterns found in the library to sync.'));
        return;
      }

      console.log(`  Found ${c.bold(String(allPatterns.length))} patterns in SQLite`);
      const result = await bridge.syncFromSQLite(allPatterns);

      console.log(`\n${c.boldGreen('Sync complete!')}`);
      console.log(`  Indexed:    ${c.green(String(result.indexed))}`);
      console.log(`  Errors:     ${result.errors > 0 ? c.red(String(result.errors)) : c.dim('0')}`);
      console.log(`  Collection: ${c.bold(String(result.total_in_collection))} total patterns in ChromaDB`);
      return;
    }

    if (sub === 'search') {
      const query = args.query || args.description || args._positional.slice(1).join(' ');
      if (!query) {
        console.error(c.boldRed('Error:') + ' Provide a search query: chromadb search "rate limiter"');
        process.exit(1);
      }

      const nResults = parseInt(args.limit || args.n || '5', 10);
      const minCoherence = parseFloat(args['min-coherence'] || '0');
      const language = args.language || null;

      console.log(`${c.boldCyan('ChromaDB Semantic Search')}: "${c.bold(query)}"\n`);

      const results = await bridge.search(query, {
        nResults,
        minCoherence,
        language,
        includeCandidates: args.candidates === true,
      });

      if (!results || results.length === 0) {
        console.log(c.yellow('No matches found.'));
        return;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const badge = r.is_candidate ? c.yellow('[CANDIDATE]') : c.green('[PROVEN]');
        console.log(`${c.bold(`#${i + 1}`)} ${badge} ${c.cyan(r.name || r.id)}`);
        console.log(`   Composite:  ${colorScore(r.composite?.toFixed(3) || '?')}`);
        console.log(`   Similarity: ${colorScore(r.similarity?.toFixed(3) || '?')}`);
        console.log(`   Coherence:  ${colorScore(r.coherence?.toFixed(3) || '?')}`);
        console.log(`   Language:   ${r.language || 'unknown'}`);
        if (r.description) console.log(`   Desc:       ${r.description.slice(0, 80)}`);
        if (r.tags && r.tags.length) console.log(`   Tags:       ${r.tags.join(', ')}`);
        console.log();
      }
      return;
    }

    if (sub === 'resolve') {
      const description = args.description || args._positional.slice(1).join(' ');
      if (!description) {
        console.error(c.boldRed('Error:') + ' Provide a description: chromadb resolve --description "debounce function"');
        process.exit(1);
      }

      const language = args.language || null;
      console.log(`${c.boldCyan('ChromaDB Resolve')}: "${c.bold(description)}"\n`);

      const result = await bridge.resolve(description, language);

      console.log(`  Decision:   ${colorDecision(result.decision)}`);
      console.log(`  Confidence: ${colorScore(result.confidence?.toFixed(3) || '?')}`);
      console.log(`  Similarity: ${colorScore(result.similarity?.toFixed(3) || '?')}`);
      console.log(`  Reason:     ${result.reason}`);

      if (result.pattern) {
        console.log(`\n  ${c.boldGreen('Best Match:')}`);
        console.log(`    ID:        ${c.cyan(result.pattern.id)}`);
        console.log(`    Name:      ${result.pattern.name || '(unnamed)'}`);
        console.log(`    Coherence: ${colorScore(result.pattern.coherence?.toFixed(3))}`);
        if (result.pattern.description) {
          console.log(`    Desc:      ${result.pattern.description.slice(0, 100)}`);
        }
        if (result.pattern.code) {
          const preview = result.pattern.code.split('\n').slice(0, 8).join('\n');
          console.log(`\n${c.dim('--- Code Preview ---')}`);
          console.log(preview);
          console.log(c.dim('--- End Preview ---'));
        }
      }

      if (result.alternatives && result.alternatives.length > 0) {
        console.log(`\n  ${c.dim('Alternatives:')}`);
        for (const alt of result.alternatives) {
          console.log(`    - ${c.cyan(alt.name || alt.id)} (composite: ${alt.composite?.toFixed(3)})`);
        }
      }
      console.log();
      return;
    }

    if (sub === 'stats') {
      const stats = await bridge.stats();
      console.log(`\n${c.boldCyan('ChromaDB Engine Stats')}\n`);
      for (const [key, val] of Object.entries(stats)) {
        console.log(`  ${c.bold(key.padEnd(22))} ${val}`);
      }
      console.log();
      return;
    }

    if (sub === 'tier') {
      const { EmbeddingEngine } = require('../../search/embedding-engine');
      const engine = new EmbeddingEngine();
      const tier = await engine.detectTier();
      console.log(`\n${c.boldCyan('Active Embedding Tier')}: ${c.boldGreen(tier)}\n`);
      const status = engine.status();
      for (const [key, val] of Object.entries(status)) {
        console.log(`  ${c.bold(key.padEnd(22))} ${val}`);
      }
      console.log();
      return;
    }

    console.error(c.boldRed('Unknown subcommand:') + ` ${sub}. Run ${c.cyan('chromadb help')} for usage.`);
  };
}

module.exports = { registerChromaDBCommands };
