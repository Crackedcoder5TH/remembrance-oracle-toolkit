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

    else {
      throw new Error(`Unknown command: ${command}`);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

run();
