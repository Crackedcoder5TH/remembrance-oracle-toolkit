#!/usr/bin/env node

/**
 * GitHub event handler — runs inside GitHub Actions to process
 * Oracle commands from issues, repository_dispatch, and workflow_dispatch events.
 *
 * Modes:
 *   - Issue:    reads ISSUE_BODY env var, processes, posts comment via gh CLI
 *   - Dispatch: reads JSON from stdin, processes, outputs result
 *   - Direct:   reads ORACLE_COMMAND env var, runs CLI-style command
 *
 * Supports all oracle actions: submit, query, search, resolve, validate,
 * feedback, inspect, stats, prune, patterns, harvest, maintain, auto-submit.
 */

const { AIConnector } = require('./connector');
const { parseIssueCommand, formatAsComment } = require('./github-bridge');
const { execFileSync } = require('child_process');

const connector = new AIConnector({ provider: 'github', modelId: 'actions' });

/**
 * Set GitHub Actions output variable.
 */
function setActionOutput(name, value) {
  const fs = require('fs');
  const outputFile = process.env.GITHUB_OUTPUT;
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (outputFile) {
    if (str.includes('\n')) {
      // Use heredoc format for multiline values (GitHub Actions requirement)
      const delimiter = 'EOF_' + Date.now();
      fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${str}\n${delimiter}\n`);
    } else {
      fs.appendFileSync(outputFile, `${name}=${str}\n`);
    }
  }
}

function handleIssue() {
  const body = process.env.ISSUE_BODY;
  const issueNumber = process.env.ISSUE_NUMBER;
  const repo = process.env.REPO;

  if (!body || !issueNumber) {
    console.error('Missing ISSUE_BODY or ISSUE_NUMBER');
    process.exit(1);
  }

  const command = parseIssueCommand(body);
  if (process.env.ORACLE_DEBUG) console.log('Parsed command:', JSON.stringify(command));

  const result = connector.execute(command);
  if (process.env.ORACLE_DEBUG) console.log('Result:', JSON.stringify(result, null, 2));

  // Set action outputs
  setActionOutput('result', result);
  if (result.accepted !== undefined) setActionOutput('accepted', result.accepted);
  if (result.coherencyScore !== undefined) setActionOutput('coherency-score', result.coherencyScore);

  const comment = formatAsComment(result);

  // Post comment back to the issue
  if (process.env.GITHUB_TOKEN && repo) {
    try {
      execFileSync('gh', [
        'issue', 'comment', String(issueNumber),
        '--repo', String(repo),
        '--body', comment,
      ], { stdio: 'inherit', env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } });
      if (process.env.ORACLE_DEBUG) console.log('Comment posted successfully');
    } catch (err) {
      console.error('Failed to post comment:', err.message);
      console.log('\n--- RESULT ---\n' + comment);
    }
  } else {
    console.log('\n--- RESULT ---\n' + comment);
  }
}

function handleDispatch() {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(input);
      const command = payload.action
        ? payload
        : { action: payload.command || 'stats', params: payload.params || payload };

      const result = connector.execute(command);
      setActionOutput('result', result);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to parse dispatch payload:', err.message);
      process.exit(1);
    }
  });
}

/**
 * Handle direct CLI-style invocation via ORACLE_COMMAND env var.
 * This allows workflow_dispatch to run any oracle command directly.
 */
function handleDirect() {
  const cmd = process.env.ORACLE_COMMAND;
  const params = {};

  // Parse env vars matching ORACLE_PARAM_* into params
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith('ORACLE_PARAM_') && val) {
      const paramName = key.slice(13).toLowerCase().replace(/_/g, '-');
      params[paramName] = val;
    }
  }

  // Map common params
  const command = {
    action: cmd,
    params: {
      description: params.description || process.env.ORACLE_DESCRIPTION || undefined,
      language: params.language || process.env.ORACLE_LANGUAGE || undefined,
      tags: (params.tags || process.env.ORACLE_TAGS || '').split(',').map(t => t.trim()).filter(Boolean),
      limit: parseInt(params.limit || process.env.ORACLE_LIMIT || '5') || 5,
      code: params.code || undefined,
      id: params.id || process.env.ORACLE_ENTRY_ID || undefined,
      succeeded: params.success === 'true',
      minCoherency: parseFloat(params['min-coherency'] || '0.5') || 0.5,
    },
  };

  const result = connector.execute(command);
  setActionOutput('result', result);
  console.log(JSON.stringify(result, null, 2));
}

// Determine which mode we're in
if (process.env.ISSUE_BODY) {
  handleIssue();
} else if (process.env.ORACLE_COMMAND) {
  handleDirect();
} else {
  handleDispatch();
}
