#!/usr/bin/env node

/**
 * GitHub event handler — runs inside GitHub Actions to process
 * Oracle commands from issues and repository_dispatch events.
 *
 * For issues:   reads ISSUE_BODY env var, processes, posts comment via gh CLI
 * For dispatch: reads JSON from stdin, processes, outputs result
 */

const { AIConnector } = require('./connector');
const { parseIssueCommand, formatAsComment } = require('./github-bridge');
const { execSync } = require('child_process');

const connector = new AIConnector({ provider: 'github', modelId: 'actions' });

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

  const comment = formatAsComment(result);

  // Post comment back to the issue
  if (process.env.GITHUB_TOKEN && repo) {
    try {
      const escaped = comment.replace(/'/g, "'\\''");
      execSync(
        `gh issue comment ${issueNumber} --repo ${repo} --body '${escaped}'`,
        { stdio: 'inherit', env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } }
      );
      if (process.env.ORACLE_DEBUG) console.log('Comment posted successfully');
    } catch (err) {
      console.error('Failed to post comment:', err.message);
      // Still output the result
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
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Failed to parse dispatch payload:', err.message);
      process.exit(1);
    }
  });
}

// Determine which mode we're in
if (process.env.ISSUE_BODY) {
  handleIssue();
} else {
  handleDispatch();
}
