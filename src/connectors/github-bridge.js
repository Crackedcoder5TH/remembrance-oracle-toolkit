/**
 * GitHub Bridge — Connects any AI to the Oracle through GitHub itself.
 *
 * Three connection methods:
 *
 * 1. ISSUE COMMANDS — AI creates a GitHub issue with a JSON command body,
 *    the Oracle processes it and posts the result as a comment.
 *
 * 2. WORKFLOW DISPATCH — AI triggers a workflow_dispatch event via GitHub API
 *    with command parameters, gets results in the workflow output.
 *
 * 3. REPOSITORY DISPATCH — AI sends a repository_dispatch event with
 *    a command payload, the Oracle processes it in a workflow.
 *
 * All methods use the same universal command format:
 *   { "action": "query", "params": { "description": "...", "tags": [...] } }
 */

const { AIConnector } = require('./connector');

/**
 * Parse a command from a GitHub issue body.
 * Expects the issue body to contain a JSON code block.
 */
function parseIssueCommand(issueBody) {
  // Try to extract JSON from a code block
  const codeBlockMatch = issueBody.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try to parse the entire body as JSON
  try {
    return JSON.parse(issueBody.trim());
  } catch {
    // fall through
  }

  // Try natural language parsing
  return parseNaturalLanguage(issueBody);
}

/**
 * Basic natural language command parsing.
 * So an AI can just say "query for sorting algorithms in javascript" as an issue title.
 */
function parseNaturalLanguage(text) {
  const lower = text.toLowerCase();

  if (/\b(stats|statistics|summary|status)\b/.test(lower)) {
    return { action: 'stats', params: {} };
  }

  if (/\b(query|search|find|get|pull|fetch|need|looking for)\b/.test(lower)) {
    const langMatch = lower.match(/\b(javascript|python|rust|go|java|typescript|ruby|cpp|c\+\+)\b/);
    const tagMatch = text.match(/(?:tags?|about|for)\s*:?\s*([a-zA-Z0-9, ]+)/i);
    return {
      action: 'query',
      params: {
        description: text,
        language: langMatch ? langMatch[1] : undefined,
        tags: tagMatch ? tagMatch[1].split(',').map(t => t.trim()).filter(Boolean) : [],
      },
    };
  }

  if (/\b(prune|clean|remove old)\b/.test(lower)) {
    return { action: 'prune', params: {} };
  }

  // Default: treat as a query
  return { action: 'query', params: { description: text } };
}

/**
 * Format an Oracle result as a GitHub issue comment (markdown).
 */
function formatAsComment(result) {
  const lines = [`## Oracle Response\n`];

  if (result.action === 'query') {
    lines.push(`Found **${result.count}** result(s):\n`);
    for (const r of result.results || []) {
      lines.push(`### ${r.description || 'Untitled'} \`${r.id}\``);
      lines.push(`**Language:** ${r.language} | **Coherency:** ${r.coherencyScore} | **Relevance:** ${r.relevanceScore}`);
      lines.push(`**Tags:** ${(r.tags || []).join(', ') || 'none'}\n`);
      lines.push('```' + (r.language || '') + '\n' + r.code + '\n```\n');
    }
  } else if (result.action === 'submit') {
    if (result.accepted) {
      lines.push(`Code **accepted** with coherency score **${result.coherencyScore}**`);
      lines.push(`Entry ID: \`${result.id}\``);
    } else {
      lines.push(`Code **rejected**: ${result.reason}`);
    }
  } else if (result.action === 'stats') {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total entries | ${result.totalEntries} |`);
    lines.push(`| Languages | ${(result.languages || []).join(', ') || 'none'} |`);
    lines.push(`| Avg coherency | ${result.avgCoherency} |`);
  } else if (result.action === 'feedback') {
    lines.push(result.success
      ? `Feedback recorded. New reliability: **${result.newReliability}**`
      : `Error: ${result.error}`);
  } else {
    lines.push('```json\n' + JSON.stringify(result, null, 2) + '\n```');
  }

  return lines.join('\n');
}

/**
 * Generate the GitHub Actions workflow YAML for handling AI dispatch events.
 */
function generateDispatchWorkflow() {
  return `name: Oracle AI Bridge

on:
  repository_dispatch:
    types: [oracle-command]
  issues:
    types: [opened]

permissions:
  contents: write
  issues: write

jobs:
  handle-dispatch:
    name: Handle AI Command (dispatch)
    runs-on: ubuntu-latest
    if: github.event_name == 'repository_dispatch'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Process command
        run: |
          echo '\${{ toJson(github.event.client_payload) }}' | node src/connectors/github-handler.js
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

  handle-issue:
    name: Handle AI Command (issue)
    runs-on: ubuntu-latest
    if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'oracle-command')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Process issue command
        run: node src/connectors/github-handler.js
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ISSUE_BODY: \${{ github.event.issue.body }}
          ISSUE_NUMBER: \${{ github.event.issue.number }}
          REPO: \${{ github.repository }}
`;
}

module.exports = {
  parseIssueCommand,
  parseNaturalLanguage,
  formatAsComment,
  generateDispatchWorkflow,
};
