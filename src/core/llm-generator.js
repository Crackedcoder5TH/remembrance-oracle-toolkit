/**
 * LLM-Powered Generation — uses Claude API for intelligent code generation.
 *
 * Replaces regex-based transpilation with LLM-quality output:
 *   1. Transpile patterns to any language with correct idioms
 *   2. Generate test code for candidates
 *   3. Refine code via SERF with LLM suggestions
 *   4. Generate approach alternatives (different algorithms)
 *   5. Generate documentation
 *
 * Supports: Claude API (Anthropic), OpenAI-compatible, or local models.
 * Falls back to regex-based generation if no API key is configured.
 */

const https = require('https');
const http = require('http');

// ─── LLM Client ───

class LLMClient {
  /**
   * @param {object} options
   *   - provider: 'anthropic' | 'openai' | 'local' (default: 'anthropic')
   *   - apiKey: API key (or process.env.ANTHROPIC_API_KEY / OPENAI_API_KEY)
   *   - model: Model ID (default: 'claude-haiku-4-5-20251001' for speed/cost)
   *   - baseUrl: Custom API base URL (for local/proxy)
   *   - maxTokens: Max output tokens (default: 2048)
   *   - temperature: Sampling temperature (default: 0.3 for deterministic code)
   */
  constructor(options = {}) {
    this.provider = options.provider || 'anthropic';
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
    this.model = options.model || (this.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini');
    this.baseUrl = options.baseUrl || null;
    this.maxTokens = options.maxTokens || 2048;
    this.temperature = options.temperature ?? 0.3;
  }

  /**
   * Check if the client is configured with an API key.
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Send a prompt to the LLM and return the text response.
   * @param {string} systemPrompt - System instructions
   * @param {string} userPrompt - User message
   * @returns {Promise<string>} The response text
   */
  async complete(systemPrompt, userPrompt) {
    if (!this.isConfigured()) {
      throw new Error('LLM API key not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    }

    if (this.provider === 'anthropic') {
      return this._completeAnthropic(systemPrompt, userPrompt);
    }
    return this._completeOpenAI(systemPrompt, userPrompt);
  }

  async _completeAnthropic(systemPrompt, userPrompt) {
    const url = this.baseUrl || 'https://api.anthropic.com';
    const body = JSON.stringify({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const parsed = new URL(`${url}/v1/messages`);
    const response = await this._request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, body);

    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.content?.[0]?.text || '';
  }

  async _completeOpenAI(systemPrompt, userPrompt) {
    const url = this.baseUrl || 'https://api.openai.com';
    const body = JSON.stringify({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const parsed = new URL(`${url}/v1/chat/completions`);
    const response = await this._request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    }, body);

    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.choices?.[0]?.message?.content || '';
  }

  _request(options, body) {
    return new Promise((resolve, reject) => {
      const proto = options.port === 80 ? http : https;
      const req = proto.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('LLM request timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }
}

// ─── LLM Generator ───

class LLMGenerator {
  /**
   * @param {object} options
   *   - client: LLMClient instance (created with defaults if not provided)
   *   - fallbackToRegex: Use regex transpilation when LLM unavailable (default: true)
   *   - verbose: Log generation details (default: false)
   */
  constructor(options = {}) {
    this.client = options.client || new LLMClient(options);
    this.fallbackToRegex = options.fallbackToRegex !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * Check if LLM is available.
   */
  isAvailable() {
    return this.client.isConfigured();
  }

  /**
   * Transpile a code pattern to another language.
   * @param {object} pattern - { code, testCode, name, language, tags }
   * @param {string} targetLanguage - Target language
   * @returns {Promise<object|null>} Transpiled pattern or null
   */
  async transpile(pattern, targetLanguage) {
    const systemPrompt = `You are an expert code transpiler. Convert code between programming languages while preserving exact functionality. Output ONLY code, no explanations.`;

    const userPrompt = `Convert this ${pattern.language || 'javascript'} code to ${targetLanguage}:

\`\`\`${pattern.language || 'javascript'}
${pattern.code}
\`\`\`

${pattern.testCode ? `Also convert these tests:

\`\`\`${pattern.language || 'javascript'}
${pattern.testCode}
\`\`\`

Output the converted code first, then the converted tests, separated by "---TESTS---".` : 'Output only the converted code.'}

Requirements:
- Use idiomatic ${targetLanguage} patterns and conventions
- Preserve the exact same algorithm and behavior
- Use proper naming conventions for ${targetLanguage}
- Include type annotations if ${targetLanguage} supports them
- Do NOT add import statements unless absolutely required`;

    try {
      const response = await this.client.complete(systemPrompt, userPrompt);
      return this._parseTranspileResponse(response, pattern, targetLanguage);
    } catch (err) {
      if (this.verbose) console.error(`LLM transpile error: ${err.message}`);
      return null;
    }
  }

  /**
   * Generate test code for a pattern/candidate.
   * @param {object} pattern - { code, name, language, description }
   * @returns {Promise<string|null>} Test code or null
   */
  async generateTests(pattern) {
    const lang = pattern.language || 'javascript';
    const systemPrompt = `You are an expert test writer. Generate comprehensive test code. Output ONLY test code, no explanations.`;

    const testStyle = lang === 'python'
      ? 'Use assert statements (no unittest/pytest imports needed). Test edge cases.'
      : lang === 'go'
        ? 'Use testing.T with t.Errorf for failures. Test edge cases.'
        : 'Use if/throw assertions (no test framework). Each test: if (result !== expected) throw new Error("...")';

    const userPrompt = `Generate tests for this ${lang} code:

\`\`\`${lang}
${pattern.code}
\`\`\`

${pattern.description ? `Description: ${pattern.description}` : ''}

Requirements:
- ${testStyle}
- Test at least 3 normal cases and 2 edge cases
- Test with empty inputs, single elements, large values where applicable
- Output ONLY the test code, no explanations or markdown`;

    try {
      const response = await this.client.complete(systemPrompt, userPrompt);
      return this._extractCode(response, lang);
    } catch (err) {
      if (this.verbose) console.error(`LLM test generation error: ${err.message}`);
      return null;
    }
  }

  /**
   * Generate an approach alternative (different algorithm for same problem).
   * @param {object} pattern - { code, name, language, description }
   * @returns {Promise<object|null>} Alternative pattern or null
   */
  async generateAlternative(pattern) {
    const lang = pattern.language || 'javascript';
    const systemPrompt = `You are an expert programmer. Generate an alternative implementation using a different algorithm or approach. Output ONLY code, no explanations.`;

    const userPrompt = `Here is a ${lang} function:

\`\`\`${lang}
${pattern.code}
\`\`\`

Generate an alternative implementation that:
- Solves the exact same problem
- Uses a DIFFERENT algorithm or approach
- Has the same function signature (same name and parameters)
- May have different performance characteristics

Output ONLY the alternative function code, no explanations.`;

    try {
      const response = await this.client.complete(systemPrompt, userPrompt);
      const code = this._extractCode(response, lang);
      if (!code) return null;

      return {
        name: `${pattern.name}-alt`,
        code,
        language: lang,
        description: `${pattern.description || pattern.name} (alternative approach)`,
        tags: [...(pattern.tags || []), 'alternative', 'llm-generated'],
        patternType: pattern.patternType || 'utility',
        parentPattern: pattern.name,
      };
    } catch (err) {
      if (this.verbose) console.error(`LLM alternative error: ${err.message}`);
      return null;
    }
  }

  /**
   * Refine code using SERF-style improvement suggestions.
   * @param {object} pattern - { code, name, language }
   * @param {object} coherencyReport - The coherency score breakdown
   * @returns {Promise<string|null>} Improved code or null
   */
  async refine(pattern, coherencyReport) {
    const lang = pattern.language || 'javascript';
    const weakDimensions = [];
    if (coherencyReport) {
      for (const [dim, score] of Object.entries(coherencyReport)) {
        if (dim !== 'total' && typeof score === 'number' && score < 0.7) {
          weakDimensions.push(`${dim}: ${score.toFixed(2)}`);
        }
      }
    }

    const systemPrompt = `You are an expert code reviewer. Improve code quality while preserving exact functionality. Output ONLY improved code, no explanations.`;

    const userPrompt = `Improve this ${lang} code:

\`\`\`${lang}
${pattern.code}
\`\`\`

${weakDimensions.length > 0 ? `Weak quality dimensions to focus on: ${weakDimensions.join(', ')}` : 'Improve overall quality.'}

Requirements:
- Keep the exact same function signature and behavior
- Improve readability, naming, and structure
- Reduce unnecessary complexity
- Add input validation where appropriate
- Output ONLY the improved code`;

    try {
      const response = await this.client.complete(systemPrompt, userPrompt);
      return this._extractCode(response, lang);
    } catch (err) {
      if (this.verbose) console.error(`LLM refine error: ${err.message}`);
      return null;
    }
  }

  /**
   * Generate documentation for a pattern.
   * @param {object} pattern - { code, name, language }
   * @returns {Promise<string|null>} JSDoc/docstring or null
   */
  async generateDocs(pattern) {
    const lang = pattern.language || 'javascript';
    const systemPrompt = `You are a technical writer. Generate concise documentation. Output ONLY the documentation comment, no code.`;

    const docStyle = lang === 'python' ? 'Google-style docstring' :
      lang === 'go' ? 'Go doc comment' :
        'JSDoc comment';

    const userPrompt = `Generate a ${docStyle} for this ${lang} code:

\`\`\`${lang}
${pattern.code}
\`\`\`

Requirements:
- Brief description (1-2 sentences)
- Document all parameters with types
- Document return value with type
- Include one usage example
- Output ONLY the documentation comment`;

    try {
      return await this.client.complete(systemPrompt, userPrompt);
    } catch (err) {
      if (this.verbose) console.error(`LLM docs error: ${err.message}`);
      return null;
    }
  }

  // ─── Response Parsing ───

  _parseTranspileResponse(response, pattern, targetLanguage) {
    const parts = response.split('---TESTS---');
    const code = this._extractCode(parts[0], targetLanguage);
    const testCode = parts.length > 1 ? this._extractCode(parts[1], targetLanguage) : '';

    if (!code) return null;

    // Convert name to target language conventions
    const name = pattern.name || 'unnamed';
    const targetName = targetLanguage === 'python'
      ? name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase()
      : targetLanguage === 'go'
        ? name.charAt(0).toUpperCase() + name.slice(1)
        : name;

    return {
      name: `${targetName}-${targetLanguage.slice(0, 2)}`,
      code,
      testCode: testCode || '',
      language: targetLanguage,
      description: `${pattern.description || name} (${targetLanguage} variant, LLM-generated)`,
      tags: [...(pattern.tags || []), 'variant', targetLanguage, 'llm-generated'],
      patternType: pattern.patternType || 'utility',
      parentPattern: pattern.name,
    };
  }

  _extractCode(text, language) {
    if (!text) return null;

    // Try to extract from code blocks
    const blockPattern = new RegExp('```(?:' + language + ')?\\s*\\n([\\s\\S]*?)```', 'i');
    const match = text.match(blockPattern);
    if (match) return match[1].trim();

    // Try generic code block
    const genericMatch = text.match(/```\w*\s*\n([\s\S]*?)```/);
    if (genericMatch) return genericMatch[1].trim();

    // If no code blocks, return trimmed text (assuming it's raw code)
    const trimmed = text.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('Here')) {
      return trimmed;
    }

    return null;
  }
}

module.exports = { LLMClient, LLMGenerator };
