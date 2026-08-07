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
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[github-bridge:parseIssueCommand] silent failure:', e?.message || e);
      // fall through
    }
  }

  // Try to parse the entire body as JSON
  try {
    return JSON.parse(issueBody.trim());
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[github-bridge:parseIssueCommand] silent failure:', e?.message || e);
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

module.exports = {
  parseIssueCommand,
  parseNaturalLanguage,
  formatAsComment,

};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
parseIssueCommand.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
parseNaturalLanguage.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "gas", reactivity: "low", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
formatAsComment.atomicProperties = { charge: 1, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 3, harmPotential: "minimal", alignment: "healing", intention: "neutral", domain: "utility" };
