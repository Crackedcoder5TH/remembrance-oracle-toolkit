/**
 * Claude Bridge — native LLM integration using Claude CLI.
 *
 * Instead of requiring an API key, this bridge invokes Claude Code CLI
 * directly via child_process. Since the user already has Claude Code
 * installed and authenticated, this provides zero-config LLM access.
 *
 * Capabilities:
 *   1. Transpile code between languages with idiomatic output
 *   2. Generate tests for candidates
 *   3. Generate approach alternatives (different algorithms)
 *   4. Refine code based on coherency weak dimensions
 *   5. Generate documentation
 *   6. Analyze code for potential improvements
 *   7. Explain code patterns in natural language
 *
 * Falls back to the existing regex/reflection pipeline when CLI is unavailable.
 */

const { execFileSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Claude CLI Detection ───

/**
 * Find the Claude CLI binary path.
 * Checks common install locations and PATH.
 */
function findClaudeCLI() {
  // Check common paths
  const candidates = [
    'claude',
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const candidate of candidates) {
    try {
      execFileSync('which', [candidate], { stdio: 'pipe', timeout: 5000 });
      return candidate;
    } catch {
      // Try direct path existence
      if (candidate !== 'claude') {
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch { /* not found */ }
      }
    }
  }

  // Final attempt: just try 'claude' directly
  try {
    execFileSync('claude', ['--version'], { stdio: 'pipe', timeout: 5000 });
    return 'claude';
  } catch {
    return null;
  }
}

// ─── Claude Bridge ───

class ClaudeBridge {
  /**
   * @param {object} options
   *   - cliPath: Path to claude CLI (auto-detected if not provided)
   *   - timeout: Max execution time in ms (default: 60000)
   *   - model: Model to use (default: let CLI decide)
   *   - verbose: Log debug info (default: false)
   *   - fallback: Fallback generator (e.g., regex-based recycler)
   */
  constructor(options = {}) {
    this.cliPath = options.cliPath || null;
    this.timeout = options.timeout || 60000;
    this.model = options.model || null;
    this.verbose = options.verbose || false;
    this.fallback = options.fallback || null;
    this._available = null; // Lazy detection
  }

  /**
   * Check if Claude CLI is available.
   */
  isAvailable() {
    if (this._available !== null) return this._available;
    if (!this.cliPath) {
      this.cliPath = findClaudeCLI();
    }
    this._available = !!this.cliPath;
    return this._available;
  }

  /**
   * Send a prompt to Claude via CLI and get the response.
   * Uses --print mode for non-interactive single-shot prompts.
   *
   * @param {string} prompt - The prompt to send
   * @param {object} options - { timeout, maxTokens }
   * @returns {string|null} Response text or null on failure
   */
  prompt(prompt, options = {}) {
    if (!this.isAvailable()) return null;

    const timeout = options.timeout || this.timeout;

    try {
      const args = ['--print'];
      if (this.model) {
        args.push('--model', this.model);
      }
      args.push(prompt);

      const result = execFileSync(this.cliPath, args, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'oracle-bridge' },
      });

      return result.toString('utf8').trim();
    } catch (err) {
      if (this.verbose) {
        console.error(`Claude CLI error: ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Send a prompt asynchronously.
   */
  promptAsync(prompt, options = {}) {
    return new Promise((resolve) => {
      if (!this.isAvailable()) {
        resolve(null);
        return;
      }

      const timeout = options.timeout || this.timeout;
      const args = ['--print'];
      if (this.model) {
        args.push('--model', this.model);
      }
      args.push(prompt);

      const child = execFile(this.cliPath, args, {
        timeout,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'oracle-bridge' },
      }, (err, stdout) => {
        if (err) {
          if (this.verbose) console.error(`Claude CLI async error: ${err.message}`);
          resolve(null);
          return;
        }
        resolve(stdout.toString('utf8').trim());
      });

      child.stdin.end();
    });
  }

  // ─── High-Level Operations ───

  /**
   * Transpile code from one language to another.
   * Uses Claude for idiomatic, correct transpilation.
   *
   * @param {object} pattern - { code, language, name, testCode, tags }
   * @param {string} targetLanguage - Target language
   * @returns {object|null} { name, code, testCode, language, description, tags }
   */
  transpile(pattern, targetLanguage) {
    const prompt = `You are a code transpiler. Convert this ${pattern.language || 'javascript'} code to idiomatic ${targetLanguage}. Output ONLY the converted code inside a single code block. No explanations.

\`\`\`${pattern.language || 'javascript'}
${pattern.code}
\`\`\`

Requirements:
- Use idiomatic ${targetLanguage} naming conventions and patterns
- Preserve exact functionality and algorithm
- Include type annotations if the language supports them
- Do NOT add imports unless absolutely required`;

    const response = this.prompt(prompt);
    if (!response) return null;

    const code = extractCodeBlock(response, targetLanguage);
    if (!code) return null;

    // Convert name to target conventions
    const name = convertName(pattern.name || 'unnamed', targetLanguage);

    return {
      name: `${name}-${targetLanguage.slice(0, 2)}`,
      code,
      testCode: '',
      language: targetLanguage,
      description: `${pattern.description || pattern.name} (${targetLanguage} variant via Claude)`,
      tags: [...(pattern.tags || []), 'variant', targetLanguage, 'claude-generated'],
      patternType: pattern.patternType || 'utility',
      parentPattern: pattern.name,
    };
  }

  /**
   * Generate tests for a code pattern.
   */
  generateTests(pattern) {
    const lang = pattern.language || 'javascript';
    const testStyle = lang === 'python'
      ? 'Use assert statements (no pytest/unittest imports). Test edge cases.'
      : lang === 'go'
        ? 'Use testing.T with t.Errorf. Include edge cases.'
        : 'Use if/throw assertions (no test framework). Each test: if (result !== expected) throw new Error("fail")';

    const prompt = `Generate comprehensive tests for this ${lang} code. Output ONLY the test code in a single code block. No explanations.

\`\`\`${lang}
${pattern.code}
\`\`\`

${pattern.description ? `Description: ${pattern.description}` : ''}

Requirements:
- ${testStyle}
- At least 3 normal cases and 2 edge cases
- Test empty inputs, boundary values, and type handling where applicable`;

    const response = this.prompt(prompt);
    if (!response) return null;
    return extractCodeBlock(response, lang);
  }

  /**
   * Generate an alternative implementation using a different algorithm.
   */
  generateAlternative(pattern) {
    const lang = pattern.language || 'javascript';
    const prompt = `Write an alternative implementation of this ${lang} function using a DIFFERENT algorithm or approach. Keep the same function signature. Output ONLY the code in a single code block.

\`\`\`${lang}
${pattern.code}
\`\`\`

Requirements:
- Same function name and parameters
- Same input/output behavior
- Different internal algorithm (e.g., iterative vs recursive, different data structure)`;

    const response = this.prompt(prompt);
    if (!response) return null;

    const code = extractCodeBlock(response, lang);
    if (!code) return null;

    return {
      name: `${pattern.name}-alt`,
      code,
      language: lang,
      description: `${pattern.description || pattern.name} (alternative via Claude)`,
      tags: [...(pattern.tags || []), 'alternative', 'claude-generated'],
      patternType: pattern.patternType || 'utility',
      parentPattern: pattern.name,
    };
  }

  /**
   * Refine code to improve specific weak coherency dimensions.
   */
  refine(pattern, coherencyReport) {
    const lang = pattern.language || 'javascript';
    const weakDimensions = [];
    if (coherencyReport) {
      for (const [dim, score] of Object.entries(coherencyReport)) {
        if (dim !== 'total' && typeof score === 'number' && score < 0.7) {
          weakDimensions.push(`${dim}: ${score.toFixed(2)}`);
        }
      }
    }

    const prompt = `Improve this ${lang} code while preserving exact functionality. Output ONLY the improved code in a single code block.

\`\`\`${lang}
${pattern.code}
\`\`\`

${weakDimensions.length > 0 ? `Focus on these weak quality dimensions: ${weakDimensions.join(', ')}` : 'Improve overall code quality.'}

Requirements:
- Keep the exact same function signature and behavior
- Improve readability, naming, and structure
- Reduce unnecessary complexity
- Add input validation where appropriate`;

    const response = this.prompt(prompt);
    if (!response) return null;
    return extractCodeBlock(response, lang);
  }

  /**
   * Generate documentation for a pattern.
   */
  generateDocs(pattern) {
    const lang = pattern.language || 'javascript';
    const docStyle = lang === 'python' ? 'Google-style docstring'
      : lang === 'go' ? 'Go doc comment'
      : 'JSDoc comment';

    const prompt = `Write a ${docStyle} for this ${lang} code. Output ONLY the documentation comment, nothing else.

\`\`\`${lang}
${pattern.code}
\`\`\`

Requirements:
- Brief description (1-2 sentences)
- Document all parameters with types
- Document return value with type
- Include one usage example`;

    return this.prompt(prompt);
  }

  /**
   * Analyze code and suggest improvements.
   * Returns structured analysis, not code.
   */
  analyze(code, language) {
    const prompt = `Analyze this ${language || 'javascript'} code briefly. Output a JSON object with these fields:
- issues: array of {severity: "high"|"medium"|"low", description: string}
- suggestions: array of strings
- complexity: "low"|"medium"|"high"
- quality: number 0-1

\`\`\`${language || 'javascript'}
${code}
\`\`\`

Output ONLY valid JSON, no markdown or explanations.`;

    const response = this.prompt(prompt);
    if (!response) return null;

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* parse failure */ }
    return null;
  }

  /**
   * Explain a code pattern in plain language.
   */
  explain(code, language) {
    const prompt = `Explain what this ${language || 'javascript'} code does in 2-3 sentences. Be concise and technical.

\`\`\`${language || 'javascript'}
${code}
\`\`\``;

    return this.prompt(prompt);
  }
}


// ─── Helpers ───

/**
 * Extract a code block from Claude's response.
 */
function extractCodeBlock(response, language) {
  if (!response) return null;

  // Try language-specific code block
  const langPattern = new RegExp('```(?:' + (language || '\\w+') + ')?\\s*\\n([\\s\\S]*?)```', 'i');
  const match = response.match(langPattern);
  if (match) return match[1].trim();

  // Try generic code block
  const genericMatch = response.match(/```\w*\s*\n([\s\S]*?)```/);
  if (genericMatch) return genericMatch[1].trim();

  // If no code blocks, check if response looks like raw code
  const trimmed = response.trim();
  if (trimmed.length > 0 && !trimmed.startsWith('Here') && !trimmed.startsWith('This') &&
      !trimmed.startsWith('The ') && !trimmed.startsWith('I ')) {
    return trimmed;
  }

  return null;
}

/**
 * Convert a name to target language conventions.
 */
function convertName(name, targetLanguage) {
  if (targetLanguage === 'python') {
    return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }
  if (targetLanguage === 'go') {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return name;
}


module.exports = { ClaudeBridge, findClaudeCLI, extractCodeBlock, convertName };
