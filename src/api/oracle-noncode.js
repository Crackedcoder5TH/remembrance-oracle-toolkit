'use strict';

/**
 * Non-Code Domain Entry Points — submit patterns without test files.
 *
 * Opens the oracle to non-software patterns (design patterns, workflows,
 * decision frameworks, etc.) by replacing test proof with structured
 * description validation + success/failure feedback.
 *
 * Non-code patterns:
 * - Skip code syntax validation and test execution
 * - Require a structured description (inputs → transform → outputs)
 * - Start with a lower coherency baseline
 * - Build confidence through feedback cycles instead of test proof
 */

const crypto = require('crypto');
const { parseStructuredDescription, validateStructuredDescription } = require('../core/structured-description');
const { auditLog } = require('../core/audit-logger');

const NON_CODE_DEFAULTS = {
  BASE_COHERENCY: 0.55,           // Starting coherency (below PULL threshold)
  FEEDBACK_BOOST: 0.05,           // Per successful feedback
  FEEDBACK_PENALTY: 0.08,         // Per failure feedback
  MAX_COHERENCY: 0.95,            // Can never exceed this via feedback alone
  MIN_DESCRIPTION_LENGTH: 10,     // Must describe what it does
  VALID_DOMAINS: null,            // No domain restriction (accepts all)
};

/**
 * Submit a non-code pattern (knowledge, workflow, decision framework, etc.)
 *
 * @param {object} submission - The non-code submission
 * @param {string} submission.content - The pattern content (text, not code)
 * @param {string} submission.description - What this pattern does
 * @param {object} [submission.structuredDescription] - Pre-built structured description
 * @param {string[]} [submission.tags] - Tags for categorization
 * @param {string} [submission.domain] - Domain (e.g., 'design', 'workflow', 'decision')
 * @param {string} [submission.author] - Who submitted
 * @param {object} store - The oracle's verified history store
 * @param {object} [patterns] - The pattern library (optional)
 * @returns {{ success: boolean, entry?: object, error?: string }}
 */
function submitNonCode(submission, store, patterns) {
  if (!submission || typeof submission !== 'object') {
    return { success: false, error: 'Submission must be an object' };
  }

  const { content, description, tags = [], author = 'anonymous', domain } = submission;

  // Validate content
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { success: false, error: 'Content is required and must be a non-empty string' };
  }

  // Validate description
  if (!description || typeof description !== 'string' || description.trim().length < NON_CODE_DEFAULTS.MIN_DESCRIPTION_LENGTH) {
    return { success: false, error: `Description is required (minimum ${NON_CODE_DEFAULTS.MIN_DESCRIPTION_LENGTH} characters)` };
  }

  // Build or validate structured description
  const structured = submission.structuredDescription ||
    parseStructuredDescription(description, { tags });

  const validation = validateStructuredDescription(structured);
  if (!validation.valid) {
    return { success: false, error: `Invalid structured description: ${validation.errors.join(', ')}` };
  }

  // Override domain if provided
  if (domain) structured.domain = domain;

  // Build coherency score (no syntax/test scoring for non-code)
  const coherencyScore = {
    total: NON_CODE_DEFAULTS.BASE_COHERENCY,
    breakdown: {
      syntaxValid: 0.5,          // N/A for non-code, neutral score
      completeness: description.length > 50 ? 0.8 : 0.5,
      consistency: 1.0,          // Text doesn't have mixed indentation issues
      testProof: 0.0,            // No test proof initially
      historicalReliability: 0.5, // Default until feedback
    },
    nonCode: true,
  };

  const id = crypto.createHash('sha256')
    .update(content + description + Date.now())
    .digest('hex')
    .slice(0, 16);

  let entry = {
    id,
    code: content,                // Stored in 'code' field for compatibility
    language: 'non-code',
    description,
    structuredDescription: structured,
    tags: [...tags, 'non-code', structured.domain || 'general'],
    author,
    coherencyScore,
    testPassed: null,
    nonCode: true,
    domain: structured.domain,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Store the entry
  try {
    const stored = store.add({
      code: content,
      language: 'non-code',
      description,
      tags: entry.tags,
      author,
      coherencyScore,
      testPassed: null,
    });
    // Create new object with stored ID instead of mutating in place
    entry = { ...entry, id: stored.id || entry.id };
  } catch (e) {
    return { success: false, error: `Storage failed: ${e.message}` };
  }

  auditLog('submit-noncode', {
    id: entry.id,
    actor: author,
    domain: structured.domain,
    success: true,
  });

  return { success: true, entry, structured };
}

/**
 * Process feedback for a non-code pattern, adjusting its coherency.
 *
 * @param {string} id - Pattern ID
 * @param {boolean} success - Whether the pattern worked
 * @param {object} store - The oracle's store
 * @param {string} [comment] - Optional feedback comment
 * @returns {{ success: boolean, newCoherency?: number, error?: string }}
 */
function nonCodeFeedback(id, success, store, comment) {
  if (!id) return { success: false, error: 'Pattern ID is required' };

  const entries = store.getAll();
  const entry = entries.find(e => e.id === id);
  if (!entry) return { success: false, error: `Entry ${id} not found` };

  const currentCoherency = entry.coherencyScore?.total ?? NON_CODE_DEFAULTS.BASE_COHERENCY;
  const delta = success
    ? NON_CODE_DEFAULTS.FEEDBACK_BOOST
    : -NON_CODE_DEFAULTS.FEEDBACK_PENALTY;

  const newTotal = Math.max(0, Math.min(NON_CODE_DEFAULTS.MAX_COHERENCY, currentCoherency + delta));

  try {
    store.update(entry.id, {
      coherencyScore: {
        ...(entry.coherencyScore || {}),
        total: Math.round(newTotal * 1000) / 1000,
        breakdown: {
          ...(entry.coherencyScore?.breakdown || {}),
          historicalReliability: success ? Math.min(1.0, (entry.coherencyScore?.breakdown?.historicalReliability || 0.5) + 0.1) : Math.max(0, (entry.coherencyScore?.breakdown?.historicalReliability || 0.5) - 0.1),
        },
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return { success: false, error: `Update failed: ${e.message}` };
  }

  auditLog('feedback-noncode', {
    id,
    success,
    oldCoherency: currentCoherency,
    newCoherency: newTotal,
    comment,
  });

  return {
    success: true,
    newCoherency: Math.round(newTotal * 1000) / 1000,
    previousCoherency: currentCoherency,
    delta: Math.round(delta * 1000) / 1000,
  };
}

module.exports = {
  submitNonCode,
  nonCodeFeedback,
  NON_CODE_DEFAULTS,
};
