'use strict';

const { c, colorScore } = require('../../colors');
const { out } = require('./out');

/**
 * Library commands — compress.
 * Compress the library into fractal families + holographic pages, cluster by similarity, audit the integration.
 *
 * Commands: compress, cluster, audit-integration
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerCompressCommands(handlers, deps) {
  const { oracle, jsonOut } = deps;

  handlers['compress'] = (args) => {
    const { compressStore, getCompressionStats } = require('../../../compression/index');
    const sub = args._sub || 'run';

    // Get the underlying SQLite store (compression needs direct access)
    const store = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : oracle.store;

    if (sub === 'stats') {
      const stats = getCompressionStats(store);
      out(c.boldCyan('Fractal Compression Statistics:\n'));
      out(`  Total patterns:      ${c.bold(String(stats.totalPatterns))}`);
      out(`  Fractal families:    ${c.bold(String(stats.familyCount))}`);
      out(`  Compressed patterns: ${c.bold(String(stats.compressedPatterns))} (${stats.totalPatterns > 0 ? ((stats.compressedPatterns / stats.totalPatterns) * 100).toFixed(1) : '0'}%)`);
      out(`  Singleton patterns:  ${c.bold(String(stats.singletonPatterns))} (${stats.totalPatterns > 0 ? ((stats.singletonPatterns / stats.totalPatterns) * 100).toFixed(1) : '0'}%)`);
      out(`  Templates stored:    ${c.bold(String(stats.templateCount))}`);
      out(`  Avg family size:     ${c.bold(String(stats.avgFamilySize))}`);
      out(`  Compression ratio:   ${c.bold(stats.compressionRatio + 'x')}`);
      out(`  Storage saved:       ${c.bold(_formatBytes(stats.savedBytes))}`);

      out(c.boldCyan('\nHolographic Encoding:\n'));
      out(`  Pages:               ${c.bold(String(stats.pageCount))}`);
      out(`  Embeddings cached:   ${c.bold(String(stats.embeddingCount))} / ${stats.totalPatterns}`);
      out(`  Embedding dims:      ${c.bold(String(stats.embeddingDims))}`);

      if (stats.serfReady != null) {
        out(c.boldCyan('\nSERF Integration:\n'));
        out(`  SERF-ready patterns: ${c.bold(String(stats.serfReady))}`);
        out(`  Healing patterns:    ${c.bold(String(stats.serfHealing))}`);
        out(`  Validation passed:   ${c.bold(String(stats.validationPassed))}`);
        out(`  Validation failed:   ${stats.validationFailed > 0 ? c.red(String(stats.validationFailed)) : c.bold('0')}`);
      }
      return;
    }

    if (sub === 'families') {
      const { detectFamilies } = require('../../../compression/fractal');
      const patterns = store.getAllPatterns ? store.getAllPatterns() : [];
      const families = detectFamilies(patterns);

      if (families.length === 0) {
        out(c.dim('No fractal families detected. Run `compress` first.'));
        return;
      }

      out(c.boldCyan(`Fractal Families: ${families.length}\n`));
      const patternMap = new Map();
      for (const p of patterns) patternMap.set(p.id, p);

      for (const family of families.slice(0, 20)) {
        const names = family.patternIds
          .map(id => patternMap.get(id)?.name || id.slice(0, 8))
          .slice(0, 5)
          .join(', ');
        const suffix = family.memberCount > 5 ? ` +${family.memberCount - 5} more` : '';
        out(`  ${c.cyan('●')} ${c.bold(String(family.memberCount))} members: ${names}${suffix}`);
      }
      if (families.length > 20) {
        out(c.dim(`  ... and ${families.length - 20} more families`));
      }
      return;
    }

    // Default: run full compression pipeline
    const dryRun = args['dry-run'] || false;
    const verbose = true;

    out(c.boldCyan(`${dryRun ? '[DRY RUN] ' : ''}Fractal Compression + Holographic Encoding\n`));

    const result = compressStore(store, { dryRun, verbose });

    if (result.success) {
      out(`\n${c.green('✓')} Compression complete:`);
      out(`  Fractal families:  ${c.bold(String(result.familyCount))}`);
      out(`  Singletons:        ${c.bold(String(result.singletonCount))}`);
      out(`  Holo pages:        ${c.bold(String(result.pageCount))}`);
      out(`  Embeddings:        ${c.bold(String(result.embeddingCount))}`);
      if (result.stats.savedBytes > 0) {
        out(`  Storage saved:     ${c.bold(_formatBytes(result.stats.savedBytes))}`);
      }
      out(`  Compression ratio: ${c.bold(result.stats.compressionRatio + 'x')}`);
      if (result.serfReady != null) {
        out(`  SERF ready:        ${c.bold(String(result.serfReady))}`);
        out(`  SERF healing:      ${c.bold(String(result.serfHealing))}`);
        out(`  Validation:        ${c.green(String(result.validationPassed) + ' passed')}${result.validationFailed > 0 ? ', ' + c.red(String(result.validationFailed) + ' failed') : ''}`);
      }
    } else {
      out(c.red(result.message || 'Compression failed'));
    }
  };

  handlers['cluster'] = (args) => {
    const { clusterPatterns, findIsomorphisms } = require('../../../patterns/clustering');
    const patterns = oracle.patterns.getAll();
    const threshold = args.threshold ? parseFloat(args.threshold) : 0.45;
    const sub = args._sub || 'run';

    if (sub === 'isomorphisms' || sub === 'iso') {
      const isos = findIsomorphisms(patterns, { threshold });
      if (isos.length === 0) {
        out(c.dim('No cross-domain isomorphisms found.'));
        return;
      }
      out(c.boldCyan(`Found ${isos.length} cross-domain isomorphism(s):\n`));
      for (const iso of isos.slice(0, 20)) {
        out(`  ${c.bold(iso.patternA.name)} ${c.dim(`[${iso.patternA.domain}]`)} ↔ ${c.bold(iso.patternB.name)} ${c.dim(`[${iso.patternB.domain}]`)}`);
        out(`    Structural: ${colorScore(iso.similarity.structural.toFixed(3))} | Code: ${colorScore(iso.similarity.code.toFixed(3))} | Total: ${colorScore(iso.similarity.total.toFixed(3))}`);
      }
      return;
    }

    const clusters = clusterPatterns(patterns, { threshold });
    const crossDomain = clusters.filter(cl => cl.crossDomain);
    out(c.boldCyan(`Clustering: ${patterns.length} patterns → ${clusters.length} cluster(s)\n`));
    out(`  Cross-domain clusters: ${c.bold(String(crossDomain.length))}`);
    out(`  Single-domain clusters: ${c.bold(String(clusters.length - crossDomain.length))}\n`);

    const toShow = args.all ? clusters : clusters.filter(cl => cl.members.length > 1).slice(0, 15);
    for (const cl of toShow) {
      const domainLabel = cl.crossDomain ? c.yellow(' [CROSS-DOMAIN]') : '';
      out(`${c.bold(cl.id)}${domainLabel} (${cl.members.length} members, avg sim: ${colorScore(cl.avgSimilarity.toFixed(3))})`);
      for (const m of cl.members.slice(0, 5)) {
        out(`  - ${c.cyan(m.name || m.id)} ${c.dim(`[${m.language || 'unknown'}]`)}`);
      }
      if (cl.members.length > 5) out(`  ${c.dim(`  ... and ${cl.members.length - 5} more`)}`);
      out('');
    }
  };

  handlers['audit-integration'] = (args) => {
    const { auditIntegration } = require('../../../compression/fractal-library-bridge');
    const store = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : null;
    const report = auditIntegration(store, oracle.patterns);

    if (jsonOut()) { out(JSON.stringify(report)); return; }

    out(c.boldCyan('Fractal ↔ Library Integration Audit\n'));
    out(`  Total patterns:       ${c.bold(String(report.totalPatterns))}`);
    out(`  With embeddings:      ${c.bold(String(report.withEmbeddings))} (${report.totalPatterns > 0 ? ((report.withEmbeddings / report.totalPatterns) * 100).toFixed(0) : '0'}%)`);
    out(`  In fractal families:  ${c.bold(String(report.withFamilies))} (${report.totalPatterns > 0 ? ((report.withFamilies / report.totalPatterns) * 100).toFixed(0) : '0'}%)`);
    out(`  Structured descs:     ${c.bold(String(report.withStructuredDesc))} (${report.totalPatterns > 0 ? ((report.withStructuredDesc / report.totalPatterns) * 100).toFixed(0) : '0'}%)`);

    if (report.familyStats.totalFamilies > 0) {
      out(`\n${c.bold('Family Statistics:')}`);
      out(`  Total families:       ${c.bold(String(report.familyStats.totalFamilies))}`);
      out(`  Avg family size:      ${c.bold(String(report.familyStats.avgSize))}`);
      out(`  Avg family coherency: ${colorScore(String(report.familyStats.avgCoherency))}`);
    }

    if (report.gaps.length > 0) {
      out(`\n${c.bold('Gaps:')}`);
      for (const gap of report.gaps) {
        out(`  ${c.yellow('⚠')} ${gap}`);
      }
    }

    if (report.recommendations.length > 0) {
      out(`\n${c.bold('Recommendations:')}`);
      for (const rec of report.recommendations) {
        out(`  ${c.cyan('→')} ${rec}`);
      }
    }
  };
}


function _formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

module.exports = { registerCompressCommands };
