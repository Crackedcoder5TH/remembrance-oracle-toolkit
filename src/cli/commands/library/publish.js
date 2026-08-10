'use strict';

const { c, colorScore } = require('../../colors');
const { quiet } = require('../../../core/quiet');
const { out, outErr } = require('./out');

/**
 * Library commands — publish.
 * Publish eligible patterns to the REMEMBRANCE blockchain and verify / list on-chain publications.
 *
 * Commands: publish, publications, verify (via _verifyPublication)
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerPublishCommands(handlers, deps) {
  const { oracle } = deps;

  handlers['publish'] = (args) => {
    const crypto = require('crypto');
    const id = args.id || args._sub;
    const name = args.name;

    if (!id && !name) {
      outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle publish')} --id <patternId> or --name <patternName>`);
      process.exit(1);
    }

    // Look up the pattern by id or name
    const store = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : oracle.store;
    let pattern = null;
    if (id) {
      pattern = store.getPattern ? store.getPattern(id) : null;
    }
    if (!pattern && name) {
      pattern = store.getPatternByName ? store.getPatternByName(name) : null;
    }
    if (!pattern) {
      outErr(c.boldRed('Error:') + ` Pattern not found: ${id || name}`);
      process.exit(1);
    }

    // Check eligibility
    const reasons = [];

    // 1. Coherency >= 0.8
    const coherency = pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;
    if (coherency < 0.8) {
      reasons.push(`Coherency ${coherency.toFixed(3)} below threshold 0.8`);
    }

    // 2. Covenant sealed
    try {
      const { covenantCheck } = require('../../../core/covenant');
      const covenant = covenantCheck(pattern.code, { description: pattern.name });
      if (!covenant.sealed) {
        const violations = (covenant.violations || []).map(v => v.rule || v).join(', ');
        reasons.push(`Covenant not sealed — violations: ${violations}`);
      }
    } catch (_) {
      reasons.push('Covenant check unavailable');
    }

    // 3. Must have test code
    if (!pattern.testCode || !pattern.testCode.trim()) {
      reasons.push('No test code — test proof required for blockchain publication');
    }

    if (reasons.length > 0) {
      out(c.boldRed('Pattern NOT eligible for blockchain publication:\n'));
      for (const reason of reasons) {
        out(`  ${c.red('x')} ${reason}`);
      }
      return;
    }

    // Pattern is eligible — output as JSON for the REMEMBRANCE-BLOCKCHAIN publisher
    const fullHash = crypto.createHash('sha256').update(pattern.code).digest('hex');
    const exportPayload = {
      id: pattern.id,
      name: pattern.name,
      code: pattern.code,
      language: pattern.language,
      patternType: pattern.patternType,
      coherency: coherency,
      tags: pattern.tags || [],
      testCode: pattern.testCode,
      hash: fullHash,
      exportedAt: new Date().toISOString(),
    };

    out(c.boldGreen('Pattern eligible for blockchain publication'));
    out(`  Name:      ${c.bold(pattern.name)}`);
    out(`  ID:        ${c.cyan(pattern.id)}`);
    out(`  Coherency: ${colorScore(coherency)}`);
    out(`  Hash:      ${c.dim(fullHash.slice(0, 16))}...${c.dim(fullHash.slice(-8))}`);

    // Try to publish via REMEMBRANCE-BLOCKCHAIN
    try {
      const { publishPattern } = require('../../../blockchain/bridge');
      publishPattern({
        coherencyScore: { total: coherency },
        testCode: pattern.testCode,
        code: pattern.code,
        name: pattern.name,
        language: pattern.language,
      }).then((publishResult) => {
        if (publishResult && publishResult.published) {
          out(`\n${c.boldGreen('── Published to Blockchain ──')}`);
          if (publishResult.hash) out(`  Hash:      ${c.dim(publishResult.hash)}`);
          if (publishResult.watermark) out(`  Watermark: ${c.dim(publishResult.watermark)}`);
          const bridgeStatus = (publishResult.metadata && publishResult.metadata.bridgeStatus) || publishResult.bridgeStatus || 'offline';
          out(`  Bridge:    ${bridgeStatus === 'confirmed' ? c.boldGreen(bridgeStatus) : c.yellow(bridgeStatus)}`);
          if (publishResult.signature) {
            out(`  Signature: ${c.cyan(publishResult.signature)}`);
            // Record blockchain_tx in DB
            try {
              const { setBlockchainTx } = require('../../../core/oracle-config');
              const txResult = setBlockchainTx(pattern.id, publishResult.signature, store);
              if (txResult.success) {
                out(`  ${c.green('Recorded')} blockchain_tx in pattern DB`);
              }
            } catch (_) { quiet('cli:commands:library:setBlockchainTx', _);
              // Non-fatal — pattern published but DB update failed
            }
          }
        } else {
          // Publish returned non-success — fall back to export payload
          out(`\n${c.dim('── Export Payload ──')}`);
          out(JSON.stringify(exportPayload, null, 2));
        }
      }).catch(() => {
        // Blockchain publish failed — fall back to export payload
        out(`\n${c.dim('── Export Payload ──')}`);
        out(JSON.stringify(exportPayload, null, 2));
      });
      return;
    } catch (_) { quiet('cli:commands:library:setBlockchainTx', _);
      // Blockchain module not available — fall back to export payload
    }

    // Fallback: just print the export payload JSON
    out(`\n${c.dim('── Export Payload ──')}`);
    out(JSON.stringify(exportPayload, null, 2));
  };

  /**
   * Publication verification logic — checks blockchain publication status.
   * Handles --tx, --name, --id flags for on-chain verification.
   * Exposed via handlers['_verifyPublication'] so versioning.js can delegate.
   */
  function _verifyPublication(args) {
    const tx = args.tx;
    const name = args.name;
    const id = args.id;

    const store = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : oracle.store;

    if (tx) {
      // Verify a Solana transaction
      // First check if any pattern in DB has this tx
      let dbPattern = null;
      if (store && store.db) {
        try {
          const row = store.db.prepare('SELECT * FROM patterns WHERE blockchain_tx = ?').get(tx);
          if (row) {
            dbPattern = store._rowToPattern ? store._rowToPattern(row) : row;
          }
        } catch (_) { quiet('cli:commands:library:_verifyPublication', _); /* non-fatal */ }
      }

      if (dbPattern) {
        out(c.boldGreen('Transaction found in local DB:'));
        out(`  Pattern:   ${c.bold(dbPattern.name)}`);
        out(`  ID:        ${c.cyan(dbPattern.id)}`);
        if (dbPattern.blockchainHash) out(`  Hash:      ${c.dim(dbPattern.blockchainHash)}`);
        if (dbPattern.publishedAt) out(`  Published: ${c.blue(dbPattern.publishedAt)}`);
        out(`  TX:        ${c.cyan(tx)}`);
      }

      // Try to reach blockchain verification
      try {
        const { getPublisher } = require('../../../blockchain/bridge');
        const publisher = getPublisher();
        if (publisher && typeof publisher.verify === 'function') {
          const result = publisher.verify(tx);
          if (result && result.verified) {
            out(c.boldGreen('\nOn-chain verification: CONFIRMED'));
            if (result.slot) out(`  Slot:    ${result.slot}`);
            if (result.block) out(`  Block:   ${result.block}`);
          } else {
            out(c.yellow('\nOn-chain verification: UNCONFIRMED'));
          }
          return;
        }
      } catch (_) { quiet('cli:commands:library:getPublisher', _); /* blockchain module not available */ }

      // Offline fallback
      if (!dbPattern) {
        out(`  Signature: ${c.cyan(tx)}`);
      }
      out(c.dim('\nNetwork verification unavailable (blockchain bridge offline)'));
      return;
    }

    // --name or --id: look up publication status
    let pattern = null;
    if (id) {
      pattern = store.getPattern ? store.getPattern(id) : null;
    }
    if (!pattern && name) {
      pattern = store.getPatternByName ? store.getPatternByName(name) : null;
      // Fallback: LIKE search for partial name match
      if (!pattern && store.db) {
        try {
          const likeParam = '%' + name.replace(/[%_]/g, '') + '%';
          const row = store.db.prepare('SELECT * FROM patterns WHERE LOWER(name) LIKE LOWER(?) LIMIT 1').get(likeParam);
          if (row) pattern = store._rowToPattern ? store._rowToPattern(row) : row;
        } catch (_) { quiet('cli:commands:library:getPublisher', _); /* non-fatal */ }
      }
    }

    if (!pattern) {
      out(c.red('Pattern not found: ') + (id || name));
      return;
    }

    out(c.boldCyan(`Publication Status: ${c.bold(pattern.name)}\n`));
    out(`  ID:        ${c.cyan(pattern.id)}`);
    const coherency = pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;
    out(`  Coherency: ${colorScore(coherency)}`);

    if (pattern.blockchainTx) {
      out(`\n  Status:    ${c.boldGreen('PUBLISHED')}`);
      out(`  TX:        ${c.cyan(pattern.blockchainTx)}`);
      if (pattern.blockchainHash) out(`  Hash:      ${c.dim(pattern.blockchainHash)}`);
      if (pattern.publishedAt) out(`  Published: ${c.blue(pattern.publishedAt)}`);
    } else {
      out(`\n  Status:    ${c.yellow('NOT PUBLISHED')}`);
    }
  }

  // Expose as a hidden handler so versioning.js's verify handler can delegate
  handlers['_verifyPublication'] = _verifyPublication;

  handlers['publications'] = (args) => {
    const store = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : oracle.store;

    if (!store || !store.db) {
      out(c.red('SQLite store not available'));
      return;
    }

    const countOnly = args.count || false;

    // Count published
    const countRow = store.db.prepare('SELECT COUNT(*) as c FROM patterns WHERE blockchain_tx IS NOT NULL').get();
    const publishedCount = countRow ? countRow.c : 0;

    if (countOnly) {
      out(`Published patterns: ${c.bold(String(publishedCount))}`);
      return;
    }

    if (publishedCount === 0) {
      out(c.dim('No patterns have been published to the blockchain yet.'));
      return;
    }

    // Fetch published patterns
    const rows = store.db.prepare(
      'SELECT * FROM patterns WHERE blockchain_tx IS NOT NULL ORDER BY published_at DESC'
    ).all();

    const patterns = rows.map(r => store._rowToPattern ? store._rowToPattern(r) : r);

    out(c.boldCyan('Published Patterns:\n'));

    for (const p of patterns) {
      const coherency = p.coherencyTotal ?? p.coherencyScore?.total ?? 0;
      const hashTrunc = p.blockchainHash ? p.blockchainHash.slice(0, 12) + '...' : c.dim('n/a');
      const txTrunc = p.blockchainTx ? p.blockchainTx.slice(0, 16) + '...' : c.dim('n/a');
      out(`  ${c.bold(p.name)} (${c.blue(p.language || '?')}) coherency: ${colorScore(coherency)}`);
      out(`    Hash: ${c.dim(hashTrunc)} | TX: ${c.cyan(txTrunc)} | Published: ${c.blue(p.publishedAt || 'unknown')}`);
    }

    // Summary
    const avgCoherency = patterns.reduce((sum, p) => sum + (p.coherencyTotal ?? p.coherencyScore?.total ?? 0), 0) / patterns.length;
    const langBreakdown = {};
    for (const p of patterns) {
      const lang = p.language || 'unknown';
      langBreakdown[lang] = (langBreakdown[lang] || 0) + 1;
    }

    out(`\n${c.boldCyan('Summary:')}`);
    out(`  Total published: ${c.bold(String(publishedCount))}`);
    out(`  Avg coherency:   ${colorScore(avgCoherency)}`);
    out(`  Languages:       ${Object.entries(langBreakdown).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
  };
}


module.exports = { registerPublishCommands };
