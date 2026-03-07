/**
 * GitHub Action entry point for the Remembrance Oracle.
 *
 * This allows anyone to use the Oracle as a GitHub Action in their workflows:
 *
 *   - uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
 *     with:
 *       command: query
 *       description: "sorting algorithm"
 *       language: javascript
 */

const fs = require('fs');
const path = require('path');

// Lightweight core-compatible action runner (no @actions/core dependency needed)
function getInput(name) {
  const envVar = `INPUT_${name.replace(/-/g, '_').toUpperCase()}`;
  return process.env[envVar] || '';
}

function setOutput(name, value) {
  const filePath = process.env.GITHUB_OUTPUT;
  if (filePath) {
    fs.appendFileSync(filePath, `${name}=${typeof value === 'object' ? JSON.stringify(value) : value}\n`);
  }
  console.log(`::set-output name=${name}::${typeof value === 'object' ? JSON.stringify(value) : value}`);
}

async function run() {
  const { RemembranceOracle } = require('./api/oracle');
  const oracle = new RemembranceOracle();

  const command = getInput('command') || 'stats';

  try {
    if (command === 'submit') {
      const filePath = getInput('file');
      if (!filePath) throw new Error('Input "file" is required for submit');
      const code = fs.readFileSync(path.resolve(filePath), 'utf-8');
      const testFile = getInput('test-file');
      const testCode = testFile ? fs.readFileSync(path.resolve(testFile), 'utf-8') : undefined;

      const result = oracle.submit(code, {
        description: getInput('description'),
        tags: getInput('tags') ? getInput('tags').split(',').map(t => t.trim()) : [],
        language: getInput('language'),
        testCode,
        author: process.env.GITHUB_ACTOR || 'github-action',
      });

      setOutput('result', result);
      setOutput('accepted', result.accepted);
      setOutput('coherency-score', result.validation?.coherencyScore?.total || 0);

      if (result.accepted) {
        console.log(`Code accepted with coherency score: ${result.entry.coherencyScore.total}`);
      } else {
        console.log(`Code rejected: ${result.reason}`);
        process.exitCode = 1;
      }
    }

    else if (command === 'query') {
      const results = oracle.query({
        description: getInput('description'),
        tags: getInput('tags') ? getInput('tags').split(',').map(t => t.trim()) : [],
        language: getInput('language'),
        limit: parseInt(getInput('limit')) || 5,
        minCoherency: parseFloat(getInput('min-coherency')) || 0.5,
      });

      setOutput('result', results);
      console.log(`Found ${results.length} result(s)`);
      for (const r of results) {
        console.log(`\n[${r.id}] coherency=${r.coherencyScore} relevance=${r.relevanceScore}`);
        console.log(`  ${r.language} | ${r.tags.join(', ')}`);
        console.log(`  ${r.description}`);
      }
    }

    else if (command === 'validate') {
      const filePath = getInput('file');
      if (!filePath) throw new Error('Input "file" is required for validate');
      const code = fs.readFileSync(path.resolve(filePath), 'utf-8');
      const testFile = getInput('test-file');
      const testCode = testFile ? fs.readFileSync(path.resolve(testFile), 'utf-8') : undefined;

      const { validateCode } = require('./core/validator');
      const result = validateCode(code, {
        language: getInput('language'),
        testCode,
      });

      setOutput('result', result);
      setOutput('coherency-score', result.coherencyScore?.total || 0);
      console.log(`Valid: ${result.valid} | Coherency: ${result.coherencyScore?.total}`);
    }

    else if (command === 'feedback') {
      const id = getInput('entry-id');
      if (!id) throw new Error('Input "entry-id" is required for feedback');
      const succeeded = getInput('success') === 'true';
      const result = oracle.feedback(id, succeeded);
      setOutput('result', result);
      console.log(result.success ? `Reliability updated: ${result.newReliability}` : result.error);
    }

    else if (command === 'stats') {
      const stats = oracle.stats();
      setOutput('result', stats);
      console.log('Remembrance Oracle Stats:');
      console.log(`  Entries: ${stats.totalEntries}`);
      console.log(`  Languages: ${stats.languages.join(', ') || 'none'}`);
      console.log(`  Avg Coherency: ${stats.avgCoherency}`);
    }

    else if (command === 'prune') {
      const min = parseFloat(getInput('min-coherency')) || 0.4;
      const result = oracle.prune(min);
      setOutput('result', result);
      console.log(`Pruned ${result.removed} entries. ${result.remaining} remaining.`);
    }

    else if (command === 'search') {
      const desc = getInput('description');
      if (!desc) throw new Error('Input "description" is required for search');
      const limit = parseInt(getInput('limit')) || 5;
      const language = getInput('language') || undefined;
      const results = oracle.search(desc, { limit, language });
      setOutput('result', results);
      console.log(`Found ${results.length} match(es)`);
      for (const r of results) {
        console.log(`  [${r.id?.slice(0, 8)}] ${r.name || r.description || 'untitled'} (coherency: ${r.coherencyScore}, match: ${r.matchScore})`);
      }
    }

    else if (command === 'resolve') {
      const desc = getInput('description');
      if (!desc) throw new Error('Input "description" is required for resolve');
      const result = oracle.resolve({
        description: desc,
        tags: getInput('tags') ? getInput('tags').split(',').map(t => t.trim()) : [],
        language: getInput('language') || undefined,
      });
      setOutput('result', result);
      setOutput('decision', result.decision);
      console.log(`Decision: ${result.decision} (confidence: ${result.confidence})`);
      if (result.pattern) {
        console.log(`  Pattern: ${result.pattern.name || result.pattern.id}`);
      }
    }

    else if (command === 'inspect') {
      const id = getInput('entry-id');
      if (!id) throw new Error('Input "entry-id" is required for inspect');
      const entry = oracle.inspect(id);
      setOutput('result', entry || { error: 'Not found' });
      if (entry) {
        console.log(`[${entry.id}] ${entry.description || entry.name || 'untitled'}`);
        console.log(`  Language: ${entry.language} | Coherency: ${entry.coherencyScore}`);
      } else {
        console.log('Entry not found');
      }
    }

    else if (command === 'patterns') {
      const stats = oracle.patternStats();
      setOutput('result', stats);
      console.log(`Patterns: ${stats.total} | Proven: ${stats.proven} | Candidates: ${stats.candidates}`);
    }

    else if (command === 'covenant') {
      const filePath = getInput('file');
      if (!filePath) throw new Error('Input "file" is required for covenant');
      const code = fs.readFileSync(path.resolve(filePath), 'utf-8');
      const { checkCovenant } = require('./core/covenant');
      const result = checkCovenant(code);
      setOutput('result', result);
      setOutput('sealed', result.sealed);
      console.log(`Covenant: ${result.sealed ? 'SEALED' : 'BROKEN'} (${result.passed}/${result.total})`);
      if (!result.sealed) {
        for (const v of result.violations || []) {
          console.log(`  VIOLATION: ${v}`);
        }
        process.exitCode = 1;
      }
    }

    else if (command === 'security-scan') {
      const filePath = getInput('file');
      if (!filePath) throw new Error('Input "file" is required for security-scan');
      const code = fs.readFileSync(path.resolve(filePath), 'utf-8');
      const { checkCovenant } = require('./core/covenant');
      const result = checkCovenant(code);
      setOutput('result', result);
      console.log(`Security: ${result.sealed ? 'PASSED' : 'ISSUES FOUND'}`);
      if (!result.sealed) process.exitCode = 1;
    }

    else if (command === 'harvest') {
      const dir = getInput('path') || '.';
      const { harvest } = require('./ci/harvest');
      const result = await harvest(oracle, dir, { language: getInput('language') || undefined });
      setOutput('result', result);
      console.log(`Harvested: ${result.registered || 0} patterns from ${dir}`);
    }

    else if (command === 'maintain') {
      const result = await oracle.maintain();
      setOutput('result', result);
      console.log('Maintenance cycle complete');
      if (result.healed) console.log(`  Healed: ${result.healed}`);
      if (result.promoted) console.log(`  Promoted: ${result.promoted}`);
    }

    else if (command === 'auto-submit') {
      const { autoSubmit } = require('./ci/auto-submit');
      const result = await autoSubmit(oracle);
      setOutput('result', result);
      console.log('Auto-submit pipeline complete');
    }

    else {
      // Fallback: try to run as a CLI command via the oracle API
      throw new Error(`Unknown command: ${command}. Available: submit, query, search, resolve, validate, inspect, patterns, stats, feedback, prune, covenant, security-scan, harvest, maintain, auto-submit`);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
