/**
 * GitHub App Integration — Full GitHub App support for the Remembrance Oracle.
 *
 * Provides:
 *   - JWT generation (RS256) for GitHub App authentication
 *   - Installation token management with caching
 *   - Webhook handling with HMAC-SHA256 signature verification
 *   - PR analysis bot (covenant + coherency scoring)
 *   - Pattern discovery from repository code
 *   - Check run integration for covenant enforcement
 *   - Marketplace listing helpers
 *   - HTTP route handler for dashboard integration
 *
 * No external dependencies — uses Node.js built-in https and crypto.
 */

const https = require('https');
const crypto = require('crypto');

// ─── HTTP Helper ───

/**
 * Make an authenticated request to the GitHub API.
 * Follows the same pattern as github-oauth.js githubRequest.
 *
 * @param {string} path - API path (e.g. /app/installations)
 * @param {object} options - Request options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {string} [options.token] - Bearer token for Authorization header
 * @param {object} [options.body] - JSON body to send
 * @param {object} [options.headers] - Additional headers
 * @param {string} [options.hostname='api.github.com'] - Hostname
 * @param {string} [options.accept] - Accept header override
 * @returns {Promise<{status: number, data: object}>}
 */
function githubAppRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const headers = {
      'User-Agent': 'remembrance-oracle-app/1.0',
      'Accept': options.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const hostname = options.hostname || 'api.github.com';
    const req = https.request({ hostname, path, method, headers, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API request timeout')); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ─── JWT Helper ───

/**
 * Base64url encode a buffer (RFC 7515).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Create a JSON Web Token (RS256) for GitHub App authentication.
 * Uses Node.js crypto.sign for RSA-SHA256 signing.
 *
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - PEM-encoded RSA private key
 * @param {number} [ttlSeconds=600] - Token TTL (max 10 minutes for GitHub)
 * @returns {string} Signed JWT
 */
function createJWT(appId, privateKey, ttlSeconds = 600) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,       // Issued at (60s clock skew allowance)
    exp: now + ttlSeconds, // Expiration (max 10 min)
    iss: appId,          // Issuer (GitHub App ID)
  };

  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];

  const signingInput = segments.join('.');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  segments.push(base64url(signature));

  return segments.join('.');
}

// ─── GitHub App Class ───

class GitHubApp {
  /**
   * @param {object} options
   * @param {string} options.appId - GitHub App ID
   * @param {string} options.privateKey - PEM-encoded RSA private key
   * @param {string} [options.webhookSecret] - Webhook secret for signature verification
   * @param {string} [options.clientId] - OAuth client ID (for user auth flows)
   * @param {string} [options.clientSecret] - OAuth client secret
   * @param {object} [options.oracle] - RemembranceOracle instance for pattern operations
   */
  constructor(options = {}) {
    this.appId = options.appId || process.env.GITHUB_APP_ID || null;
    this.privateKey = options.privateKey || process.env.GITHUB_APP_PRIVATE_KEY || null;
    this.webhookSecret = options.webhookSecret || process.env.GITHUB_APP_WEBHOOK_SECRET || null;
    this.clientId = options.clientId || process.env.GITHUB_APP_CLIENT_ID || null;
    this.clientSecret = options.clientSecret || process.env.GITHUB_APP_CLIENT_SECRET || null;
    this.oracle = options.oracle || null;

    // Installation token cache: installationId -> { token, expiresAt }
    this._tokenCache = new Map();

    // Installation registry: installationId -> { account, repos, installedAt }
    this._installations = new Map();

    // Event listeners for webhook events
    this._eventListeners = new Map();
  }

  // ─── JWT & Installation Auth ───

  /**
   * Generate a JWT for authenticating as the GitHub App.
   * JWTs are short-lived (10 minutes max) and used to request
   * installation access tokens.
   *
   * @returns {string} Signed JWT
   * @throws {Error} If appId or privateKey is not configured
   */
  generateJWT() {
    if (!this.appId) {
      throw new Error('GitHub App ID not configured. Set appId or GITHUB_APP_ID env var.');
    }
    if (!this.privateKey) {
      throw new Error('GitHub App private key not configured. Set privateKey or GITHUB_APP_PRIVATE_KEY env var.');
    }

    return createJWT(this.appId, this.privateKey);
  }

  /**
   * Get an installation access token for a specific installation.
   * Tokens are cached and reused until they expire (1 hour lifetime,
   * refreshed with 5-minute buffer).
   *
   * @param {number|string} installationId - The installation ID
   * @returns {Promise<string>} Installation access token
   */
  async getInstallationToken(installationId) {
    const id = String(installationId);

    // Check cache — reuse token if still valid (with 5-min buffer)
    const cached = this._tokenCache.get(id);
    if (cached && cached.expiresAt > Date.now() + 300000) {
      return cached.token;
    }

    const jwt = this.generateJWT();
    const res = await githubAppRequest(`/app/installations/${id}/access_tokens`, {
      method: 'POST',
      token: jwt,
    });

    if (res.status !== 201 || !res.data.token) {
      throw new Error(`Failed to get installation token: ${res.status} ${JSON.stringify(res.data)}`);
    }

    const token = res.data.token;
    const expiresAt = new Date(res.data.expires_at).getTime();
    this._tokenCache.set(id, { token, expiresAt });

    return token;
  }

  // ─── Installation Management ───

  /**
   * Handle installation created/deleted events.
   * Tracks installations in memory for quick lookup.
   *
   * @param {object} event - Webhook event payload
   * @returns {{ action: string, installationId: number, account: string }}
   */
  handleInstallation(event) {
    const { action, installation } = event;
    const installationId = installation.id;
    const account = installation.account?.login || 'unknown';

    if (action === 'created') {
      this._installations.set(String(installationId), {
        id: installationId,
        account,
        appSlug: installation.app_slug || '',
        permissions: installation.permissions || {},
        repositorySelection: installation.repository_selection || 'all',
        installedAt: new Date().toISOString(),
      });
    } else if (action === 'deleted') {
      this._installations.delete(String(installationId));
      this._tokenCache.delete(String(installationId));
    }

    return { action, installationId, account };
  }

  /**
   * List all installations of this GitHub App.
   *
   * @returns {Promise<Array>} List of installations
   */
  async listInstallations() {
    const jwt = this.generateJWT();
    const res = await githubAppRequest('/app/installations', { token: jwt });

    if (res.status !== 200) {
      throw new Error(`Failed to list installations: ${res.status}`);
    }

    return res.data;
  }

  /**
   * Get repositories accessible to an installation.
   *
   * @param {number|string} installationId
   * @returns {Promise<Array>} List of repositories
   */
  async getInstallationRepos(installationId) {
    const token = await this.getInstallationToken(installationId);
    const res = await githubAppRequest('/installation/repositories', { token });

    if (res.status !== 200) {
      throw new Error(`Failed to get repos: ${res.status}`);
    }

    return res.data.repositories || [];
  }

  // ─── Repository Integration ───

  /**
   * Analyze a repository for oracle patterns.
   * Fetches the repo tree, identifies JS/TS files, and scores them.
   *
   * @param {number|string} installationId
   * @param {string} owner - Repo owner
   * @param {string} repo - Repo name
   * @returns {Promise<object>} Analysis results with pattern suggestions
   */
  async analyzeRepo(installationId, owner, repo) {
    const token = await this.getInstallationToken(installationId);

    // Get default branch
    const repoRes = await githubAppRequest(`/repos/${owner}/${repo}`, { token });
    if (repoRes.status !== 200) {
      throw new Error(`Failed to fetch repo: ${repoRes.status}`);
    }
    const defaultBranch = repoRes.data.default_branch || 'main';

    // Get file tree (recursive, truncated for large repos)
    const treeRes = await githubAppRequest(
      `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      { token }
    );
    if (treeRes.status !== 200) {
      throw new Error(`Failed to fetch tree: ${treeRes.status}`);
    }

    const sourceFiles = (treeRes.data.tree || []).filter(entry => {
      if (entry.type !== 'blob') return false;
      return /\.(js|ts|mjs|cjs)$/.test(entry.path) &&
        !entry.path.includes('node_modules') &&
        !entry.path.includes('.min.') &&
        !entry.path.includes('dist/') &&
        !entry.path.includes('build/');
    });

    const results = {
      repo: `${owner}/${repo}`,
      defaultBranch,
      filesScanned: 0,
      patternsFound: [],
      suggestions: [],
      truncated: treeRes.data.truncated || false,
    };

    // Analyze up to 50 source files
    const filesToScan = sourceFiles.slice(0, 50);
    for (const file of filesToScan) {
      try {
        const contentRes = await githubAppRequest(
          `/repos/${owner}/${repo}/contents/${file.path}?ref=${defaultBranch}`,
          { token }
        );
        if (contentRes.status !== 200 || !contentRes.data.content) continue;

        const code = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
        if (code.length < 20 || code.length > 50000) continue;

        results.filesScanned++;

        // Score coherency if oracle is available
        if (this.oracle) {
          const { computeCoherencyScore } = require('../core/coherency');
          const language = file.path.endsWith('.ts') ? 'typescript' : 'javascript';
          const score = computeCoherencyScore(code, language);

          if (score.total >= 0.65) {
            results.patternsFound.push({
              file: file.path,
              coherency: score.total,
              dimensions: score,
              language,
            });
          }

          // Search for similar existing patterns
          const similar = this.oracle.search(file.path.replace(/\.[^.]+$/, ''), { limit: 2 });
          if (similar.length > 0) {
            results.suggestions.push({
              file: file.path,
              similarPatterns: similar.map(s => ({
                name: s.name,
                coherency: s.coherencyScore?.total || s.coherency || 0,
                match: s.score || s.relevance || 0,
              })),
            });
          }
        }
      } catch {
        // Skip files that fail to fetch
      }
    }

    return results;
  }

  /**
   * Create a pull request on a repository.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {object} prData - { title, body, head, base, draft }
   * @returns {Promise<object>} Created PR data
   */
  async createPR(installationId, owner, repo, prData) {
    const token = await this.getInstallationToken(installationId);
    const res = await githubAppRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      token,
      body: {
        title: prData.title,
        body: prData.body || '',
        head: prData.head,
        base: prData.base || 'main',
        draft: prData.draft || false,
      },
    });

    if (res.status !== 201) {
      throw new Error(`Failed to create PR: ${res.status} ${JSON.stringify(res.data)}`);
    }

    return res.data;
  }

  /**
   * Post a review comment on a pull request.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {number} prNumber
   * @param {string} body - Comment body (markdown)
   * @returns {Promise<object>} Created comment data
   */
  async commentOnPR(installationId, owner, repo, prNumber, body) {
    const token = await this.getInstallationToken(installationId);
    const res = await githubAppRequest(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        token,
        body: { body },
      }
    );

    if (res.status !== 201) {
      throw new Error(`Failed to comment on PR: ${res.status}`);
    }

    return res.data;
  }

  /**
   * Create a check run on a commit.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {string} headSha - Commit SHA
   * @param {object} checkData - { name, status, conclusion, output, details_url }
   * @returns {Promise<object>} Created check run data
   */
  async createCheck(installationId, owner, repo, headSha, checkData) {
    const token = await this.getInstallationToken(installationId);
    const res = await githubAppRequest(`/repos/${owner}/${repo}/check-runs`, {
      method: 'POST',
      token,
      body: {
        name: checkData.name || 'Remembrance Oracle',
        head_sha: headSha,
        status: checkData.status || 'completed',
        conclusion: checkData.conclusion || 'neutral',
        started_at: checkData.started_at || new Date().toISOString(),
        completed_at: checkData.completed_at || new Date().toISOString(),
        output: checkData.output || undefined,
        details_url: checkData.details_url || undefined,
      },
    });

    if (res.status !== 201) {
      throw new Error(`Failed to create check run: ${res.status}`);
    }

    return res.data;
  }

  // ─── Webhook Handler ───

  /**
   * Process incoming GitHub webhook events.
   * Verifies the HMAC-SHA256 signature, parses the event, and dispatches
   * to the appropriate handler.
   *
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  handleWebhook(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Verify signature if webhook secret is configured
      if (this.webhookSecret) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing signature header' }));
          return;
        }

        const expected = 'sha256=' + crypto
          .createHmac('sha256', this.webhookSecret)
          .update(body)
          .digest('hex');

        // Constant-time comparison to prevent timing attacks
        if (!timingSafeEqual(signature, expected)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }
      }

      const event = req.headers['x-github-event'];
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        return;
      }

      // Dispatch to event handler
      this._dispatchEvent(event, payload).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true, event, action: payload.action, result }));
      }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    });
  }

  /**
   * Dispatch a webhook event to the appropriate handler.
   *
   * @param {string} event - GitHub event type
   * @param {object} payload - Event payload
   * @returns {Promise<object>} Handler result
   */
  async _dispatchEvent(event, payload) {
    const action = payload.action || '';
    const eventKey = action ? `${event}.${action}` : event;
    const result = { event: eventKey, handled: false };

    try {
      switch (event) {
        case 'installation': {
          result.data = this.handleInstallation(payload);
          result.handled = true;

          // Post welcome comment on new installations
          if (action === 'created' && payload.repositories?.length > 0) {
            const installationId = payload.installation.id;
            try {
              const token = await this.getInstallationToken(installationId);
              const firstRepo = payload.repositories[0];
              const [owner, repo] = firstRepo.full_name.split('/');
              // Create a welcome issue comment is optional — just track installation
              result.data.repoCount = payload.repositories.length;
            } catch {
              // Welcome message is best-effort
            }
          }
          break;
        }

        case 'push': {
          result.handled = true;
          if (!this.oracle) {
            result.data = { skipped: true, reason: 'No oracle instance configured' };
            break;
          }

          const installationId = payload.installation?.id;
          if (!installationId) {
            result.data = { skipped: true, reason: 'No installation ID in push event' };
            break;
          }

          // Scan pushed commits for potential patterns
          const commits = payload.commits || [];
          const addedFiles = [];
          const modifiedFiles = [];
          for (const commit of commits) {
            addedFiles.push(...(commit.added || []).filter(f => /\.(js|ts)$/.test(f)));
            modifiedFiles.push(...(commit.modified || []).filter(f => /\.(js|ts)$/.test(f)));
          }

          result.data = {
            ref: payload.ref,
            commits: commits.length,
            addedFiles: addedFiles.length,
            modifiedFiles: modifiedFiles.length,
          };
          break;
        }

        case 'pull_request': {
          if (action === 'opened' || action === 'synchronize') {
            result.handled = true;
            const installationId = payload.installation?.id;
            if (!installationId || !this.oracle) {
              result.data = { skipped: true, reason: 'Missing installation ID or oracle' };
              break;
            }

            const owner = payload.repository.owner.login;
            const repo = payload.repository.name;
            const prNumber = payload.pull_request.number;

            try {
              const analysis = await this.analyzePR(installationId, owner, repo, prNumber);
              result.data = analysis;

              // Post analysis comment if there are findings
              if (analysis.functions.length > 0 || analysis.covenantViolations.length > 0) {
                const comment = this._formatPRAnalysis(analysis);
                await this.commentOnPR(installationId, owner, repo, prNumber, comment);
              }
            } catch (err) {
              result.data = { error: err.message };
            }
          }
          break;
        }

        case 'issues': {
          if (action === 'opened') {
            result.handled = true;
            if (!this.oracle) {
              result.data = { skipped: true, reason: 'No oracle instance' };
              break;
            }

            const title = payload.issue?.title || '';
            const body = payload.issue?.body || '';
            const combined = `${title} ${body}`;

            // Search oracle for related patterns if issue mentions code concepts
            const searchTerms = combined.match(/\b(?:function|pattern|utility|helper|module)\s+(\w+)/i);
            if (searchTerms) {
              const patterns = this.oracle.search(searchTerms[1], { limit: 3 });
              if (patterns.length > 0) {
                result.data = {
                  relatedPatterns: patterns.map(p => ({
                    name: p.name,
                    coherency: p.coherencyScore?.total || 0,
                    language: p.language,
                  })),
                };
              }
            }
            if (!result.data) {
              result.data = { noMatches: true };
            }
          }
          break;
        }

        case 'check_suite': {
          if (action === 'requested') {
            result.handled = true;
            const installationId = payload.installation?.id;
            if (!installationId || !this.oracle) {
              result.data = { skipped: true, reason: 'Missing installation ID or oracle' };
              break;
            }

            const owner = payload.repository.owner.login;
            const repo = payload.repository.name;
            const headSha = payload.check_suite.head_sha;

            try {
              const checkResult = await this.runCovenantCheck(installationId, owner, repo, headSha);
              result.data = checkResult;
            } catch (err) {
              result.data = { error: err.message };
            }
          }
          break;
        }

        default:
          result.data = { unhandled: true, event };
      }
    } catch (err) {
      result.error = err.message;
    }

    // Notify registered listeners
    const listeners = this._eventListeners.get(event) || [];
    for (const listener of listeners) {
      try { listener(payload, result); } catch { /* best-effort */ }
    }

    return result;
  }

  /**
   * Register an event listener for webhook events.
   *
   * @param {string} event - Event name (e.g. 'push', 'pull_request')
   * @param {Function} callback - Listener function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(callback);
  }

  // ─── PR Analysis Bot ───

  /**
   * Analyze a pull request for code quality.
   * Fetches the PR diff, extracts functions, scores coherency,
   * checks covenant, and searches for similar oracle patterns.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {number} prNumber
   * @returns {Promise<object>} Analysis results
   */
  async analyzePR(installationId, owner, repo, prNumber) {
    const token = await this.getInstallationToken(installationId);

    // Fetch PR details
    const prRes = await githubAppRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, { token });
    if (prRes.status !== 200) {
      throw new Error(`Failed to fetch PR: ${prRes.status}`);
    }

    // Fetch PR diff (file-level changes)
    const filesRes = await githubAppRequest(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, { token });
    if (filesRes.status !== 200) {
      throw new Error(`Failed to fetch PR files: ${filesRes.status}`);
    }

    const analysis = {
      pr: {
        number: prNumber,
        title: prRes.data.title,
        author: prRes.data.user?.login || 'unknown',
        additions: prRes.data.additions || 0,
        deletions: prRes.data.deletions || 0,
        changedFiles: prRes.data.changed_files || 0,
      },
      functions: [],
      covenantViolations: [],
      similarPatterns: [],
      overallScore: null,
    };

    const { covenantCheck } = require('../core/covenant');
    const { computeCoherencyScore } = require('../core/coherency');
    const { extractFunctionNames } = require('../ci/auto-seed');

    const changedFiles = filesRes.data || [];
    const scores = [];

    for (const file of changedFiles) {
      // Only analyze JS/TS source files
      if (!/\.(js|ts|mjs|cjs)$/.test(file.filename)) continue;
      if (file.filename.includes('node_modules') || file.filename.includes('.min.')) continue;
      if (file.status === 'removed') continue;

      // Use the patch (diff) to extract new/modified code
      const patch = file.patch || '';
      // Extract added lines (lines starting with +, excluding +++ header)
      const addedLines = patch
        .split('\n')
        .filter(line => line.startsWith('+') && !line.startsWith('+++'))
        .map(line => line.slice(1))
        .join('\n');

      if (addedLines.length < 20) continue;

      const language = file.filename.endsWith('.ts') ? 'typescript' : 'javascript';

      // Extract function names from added code
      const functions = extractFunctionNames(addedLines, language);

      // Score coherency
      const coherency = computeCoherencyScore(addedLines, language);
      scores.push(coherency.total);

      // Check covenant
      const covenant = covenantCheck(addedLines, { language });

      if (!covenant.sealed) {
        analysis.covenantViolations.push({
          file: file.filename,
          violations: covenant.violations.map(v => ({
            principle: v.principle || v.name,
            description: v.description || v.seal || v.reason,
          })),
        });
      }

      if (functions.length > 0) {
        analysis.functions.push({
          file: file.filename,
          functions,
          coherency: coherency.total,
          language,
        });
      }

      // Search oracle for similar patterns
      if (this.oracle && functions.length > 0) {
        for (const fnName of functions.slice(0, 3)) {
          const similar = this.oracle.search(fnName, { limit: 2 });
          if (similar.length > 0) {
            analysis.similarPatterns.push({
              function: fnName,
              file: file.filename,
              matches: similar.map(s => ({
                name: s.name,
                coherency: s.coherencyScore?.total || 0,
                language: s.language,
              })),
            });
          }
        }
      }
    }

    // Compute overall score
    if (scores.length > 0) {
      analysis.overallScore = Math.round(
        (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
      ) / 100;
    }

    return analysis;
  }

  /**
   * Format PR analysis results as a markdown comment.
   *
   * @param {object} analysis - Analysis results from analyzePR
   * @returns {string} Markdown-formatted comment
   */
  _formatPRAnalysis(analysis) {
    const lines = [];
    lines.push('## Remembrance Oracle Analysis');
    lines.push('');

    if (analysis.overallScore !== null) {
      const emoji = analysis.overallScore >= 0.8 ? 'high' :
        analysis.overallScore >= 0.6 ? 'moderate' : 'low';
      lines.push(`**Overall Coherency Score:** ${analysis.overallScore} (${emoji})`);
      lines.push('');
    }

    if (analysis.covenantViolations.length > 0) {
      lines.push('### Covenant Violations');
      lines.push('');
      for (const cv of analysis.covenantViolations) {
        lines.push(`**${cv.file}:**`);
        for (const v of cv.violations) {
          lines.push(`- ${v.principle}: ${v.description}`);
        }
        lines.push('');
      }
    }

    if (analysis.functions.length > 0) {
      lines.push('### Functions Analyzed');
      lines.push('');
      lines.push('| File | Functions | Coherency |');
      lines.push('|------|-----------|-----------|');
      for (const f of analysis.functions) {
        lines.push(`| ${f.file} | ${f.functions.join(', ')} | ${f.coherency} |`);
      }
      lines.push('');
    }

    if (analysis.similarPatterns.length > 0) {
      lines.push('### Similar Oracle Patterns');
      lines.push('');
      lines.push('Consider reusing these proven patterns:');
      lines.push('');
      for (const sp of analysis.similarPatterns) {
        for (const m of sp.matches) {
          lines.push(`- **${m.name}** (${m.language}, coherency: ${m.coherency}) — similar to \`${sp.function}\` in ${sp.file}`);
        }
      }
      lines.push('');
    }

    if (analysis.covenantViolations.length === 0 && analysis.functions.length > 0) {
      lines.push('All code passes the Covenant filter.');
    }

    lines.push('');
    lines.push('---');
    lines.push('*Powered by Remembrance Oracle*');

    return lines.join('\n');
  }

  // ─── Pattern Discovery ───

  /**
   * Discover patterns in a repository by scanning its source files.
   * Uses the project's harvestFunctions to extract functions and
   * scores each for coherency.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {object} [options]
   * @param {string} [options.language] - Filter by language
   * @param {number} [options.minCoherency=0.6] - Minimum coherency threshold
   * @param {number} [options.maxFiles=30] - Max files to scan
   * @returns {Promise<object>} Discovery results with candidate patterns
   */
  async discoverPatterns(installationId, owner, repo, options = {}) {
    const { language, minCoherency = 0.6, maxFiles = 30 } = options;
    const token = await this.getInstallationToken(installationId);

    // Get repo tree
    const repoRes = await githubAppRequest(`/repos/${owner}/${repo}`, { token });
    if (repoRes.status !== 200) {
      throw new Error(`Failed to fetch repo: ${repoRes.status}`);
    }

    const defaultBranch = repoRes.data.default_branch || 'main';
    const treeRes = await githubAppRequest(
      `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      { token }
    );
    if (treeRes.status !== 200) {
      throw new Error(`Failed to fetch tree: ${treeRes.status}`);
    }

    // Filter to JS/TS source files
    const extensionFilter = language === 'typescript' ? /\.ts$/ :
      language === 'javascript' ? /\.js$/ :
        /\.(js|ts|mjs|cjs)$/;

    const sourceFiles = (treeRes.data.tree || []).filter(entry => {
      if (entry.type !== 'blob') return false;
      return extensionFilter.test(entry.path) &&
        !entry.path.includes('node_modules') &&
        !entry.path.includes('test') &&
        !entry.path.includes('spec') &&
        !entry.path.includes('.min.') &&
        !entry.path.includes('dist/') &&
        !entry.path.includes('build/');
    }).slice(0, maxFiles);

    const { computeCoherencyScore } = require('../core/coherency');
    const { extractFunctionNames } = require('../ci/auto-seed');
    const { splitFunctions } = require('../ci/harvest');

    const candidates = [];
    let filesScanned = 0;

    for (const file of sourceFiles) {
      try {
        const contentRes = await githubAppRequest(
          `/repos/${owner}/${repo}/contents/${file.path}?ref=${defaultBranch}`,
          { token }
        );
        if (contentRes.status !== 200 || !contentRes.data.content) continue;

        const code = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
        if (code.length < 20 || code.length > 50000) continue;

        filesScanned++;
        const lang = file.path.endsWith('.ts') ? 'typescript' : 'javascript';

        // Split into individual functions
        const functions = splitFunctions(code, lang);
        for (const fn of functions) {
          const coherency = computeCoherencyScore(fn.code, lang);
          if (coherency.total >= minCoherency) {
            candidates.push({
              name: fn.name,
              file: file.path,
              language: lang,
              coherency: coherency.total,
              dimensions: coherency,
              codeLength: fn.code.length,
            });
          }
        }
      } catch {
        // Skip files that fail
      }
    }

    // Sort by coherency descending
    candidates.sort((a, b) => b.coherency - a.coherency);

    return {
      repo: `${owner}/${repo}`,
      filesScanned,
      totalFiles: sourceFiles.length,
      candidates,
      threshold: minCoherency,
    };
  }

  // ─── Check Run Integration ───

  /**
   * Run covenant check on changed files and create a GitHub check run.
   * Fetches the files changed in a commit, runs covenant analysis,
   * and reports results as check run annotations.
   *
   * @param {number|string} installationId
   * @param {string} owner
   * @param {string} repo
   * @param {string} headSha - The commit SHA to check
   * @returns {Promise<object>} Check run result
   */
  async runCovenantCheck(installationId, owner, repo, headSha) {
    const token = await this.getInstallationToken(installationId);

    // Fetch the commit to get changed files
    const commitRes = await githubAppRequest(
      `/repos/${owner}/${repo}/commits/${headSha}`,
      { token }
    );
    if (commitRes.status !== 200) {
      throw new Error(`Failed to fetch commit: ${commitRes.status}`);
    }

    const { covenantCheck } = require('../core/covenant');
    const { computeCoherencyScore } = require('../core/coherency');

    const files = (commitRes.data.files || []).filter(f =>
      /\.(js|ts|mjs|cjs)$/.test(f.filename) &&
      f.status !== 'removed' &&
      !f.filename.includes('node_modules')
    );

    const annotations = [];
    let totalViolations = 0;
    let filesChecked = 0;
    const fileResults = [];

    for (const file of files.slice(0, 30)) {
      try {
        // Fetch file content at this commit
        const contentRes = await githubAppRequest(
          `/repos/${owner}/${repo}/contents/${file.filename}?ref=${headSha}`,
          { token }
        );
        if (contentRes.status !== 200 || !contentRes.data.content) continue;

        const code = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
        if (code.length < 10) continue;

        filesChecked++;
        const language = file.filename.endsWith('.ts') ? 'typescript' : 'javascript';

        // Run covenant check
        const covenant = covenantCheck(code, { language });
        const coherency = computeCoherencyScore(code, language);

        const fileResult = {
          file: file.filename,
          covenantPassed: covenant.sealed,
          principlesPassed: covenant.principlesPassed,
          coherency: coherency.total,
          violations: [],
        };

        if (!covenant.sealed) {
          for (const violation of covenant.violations) {
            totalViolations++;
            const annotation = {
              path: file.filename,
              start_line: 1,
              end_line: 1,
              annotation_level: 'warning',
              title: `Covenant: ${violation.principle || violation.name || 'Violation'}`,
              message: violation.description || violation.seal || violation.reason || 'Covenant principle violated',
            };
            annotations.push(annotation);
            fileResult.violations.push(violation.principle || violation.name);
          }
        }

        fileResults.push(fileResult);
      } catch {
        // Skip files that fail
      }
    }

    // Determine check conclusion
    const conclusion = totalViolations === 0 ? 'success' : 'failure';
    const summary = totalViolations === 0
      ? `All ${filesChecked} files pass the Covenant filter.`
      : `Found ${totalViolations} covenant violation(s) across ${filesChecked} files.`;

    // Create the check run
    const checkResult = await this.createCheck(installationId, owner, repo, headSha, {
      name: 'Remembrance Oracle — Covenant',
      status: 'completed',
      conclusion,
      output: {
        title: conclusion === 'success' ? 'Covenant Passed' : 'Covenant Violations Found',
        summary,
        text: fileResults.map(fr =>
          `**${fr.file}**: ${fr.covenantPassed ? 'PASS' : 'FAIL'} (coherency: ${fr.coherency})`
        ).join('\n'),
        annotations: annotations.slice(0, 50), // GitHub limits annotations per request
      },
    });

    return {
      conclusion,
      filesChecked,
      totalViolations,
      annotations: annotations.length,
      fileResults,
      checkRunId: checkResult.id,
    };
  }

  // ─── Marketplace ───

  /**
   * Get the marketplace plan for a GitHub account.
   *
   * @param {number|string} accountId - GitHub account ID
   * @returns {Promise<object>} Marketplace plan data
   */
  async getMarketplacePlan(accountId) {
    const jwt = this.generateJWT();
    const res = await githubAppRequest(
      `/marketplace_listing/accounts/${accountId}`,
      { token: jwt }
    );

    if (res.status === 404) {
      return { hasPlan: false, accountId };
    }

    if (res.status !== 200) {
      throw new Error(`Failed to get marketplace plan: ${res.status}`);
    }

    return {
      hasPlan: true,
      accountId,
      plan: res.data.marketplace_purchase?.plan || null,
      billingCycle: res.data.marketplace_purchase?.billing_cycle || null,
      onFreeTrial: res.data.marketplace_purchase?.on_free_trial || false,
    };
  }

  /**
   * List marketplace purchases (stubbed plans for testing).
   *
   * @returns {Promise<Array>} List of marketplace plans
   */
  async listMarketplacePurchases() {
    const jwt = this.generateJWT();
    const res = await githubAppRequest(
      '/marketplace_listing/stubbed/plans',
      { token: jwt }
    );

    if (res.status !== 200) {
      throw new Error(`Failed to list marketplace plans: ${res.status}`);
    }

    return res.data;
  }

  /**
   * Get the app status and configuration summary.
   *
   * @returns {object} Status info
   */
  getStatus() {
    return {
      configured: !!(this.appId && this.privateKey),
      appId: this.appId || null,
      hasWebhookSecret: !!this.webhookSecret,
      hasOAuth: !!(this.clientId && this.clientSecret),
      hasOracle: !!this.oracle,
      installations: this._installations.size,
      cachedTokens: this._tokenCache.size,
    };
  }
}

// ─── Webhook Signature Verification ───

/**
 * Constant-time string comparison for HMAC signatures.
 * Prevents timing attacks by comparing all bytes regardless of differences.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ─── Route Handler ───

/**
 * Parse JSON body from an HTTP request.
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>} Parsed JSON body
 */
function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Send a JSON response.
 *
 * @param {http.ServerResponse} res
 * @param {object} data
 * @param {number} [statusCode=200]
 */
function sendJSONResponse(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Route handler for GitHub App webhook and API endpoints.
 * Integrates with the dashboard server or any HTTP server.
 *
 * Routes:
 *   POST /api/github/webhook          — Main webhook endpoint
 *   GET  /api/github/installations    — List installations
 *   GET  /api/github/repos/:id        — List repos for installation
 *   POST /api/github/analyze/:o/:r    — Trigger manual analysis
 *   GET  /api/github/status           — App status + installation count
 *
 * @param {GitHubApp} app - GitHubApp instance
 * @returns {Function} Route handler (req, res, pathname, method)
 */
function webhookRoutes(app) {
  return function handleRoute(req, res, pathname, method) {
    // Normalize method
    const httpMethod = method || req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Hub-Signature-256, X-GitHub-Event');

    if (httpMethod === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // POST /api/github/webhook — Main webhook endpoint
    if (pathname === '/api/github/webhook' && httpMethod === 'POST') {
      app.handleWebhook(req, res);
      return true;
    }

    // GET /api/github/installations — List installations
    if (pathname === '/api/github/installations' && httpMethod === 'GET') {
      if (!app.appId || !app.privateKey) {
        sendJSONResponse(res, { error: 'GitHub App not configured' }, 503);
        return true;
      }

      app.listInstallations().then(installations => {
        sendJSONResponse(res, { installations });
      }).catch(err => {
        sendJSONResponse(res, { error: err.message }, 500);
      });
      return true;
    }

    // GET /api/github/repos/:installationId — List repos for installation
    const reposMatch = pathname.match(/^\/api\/github\/repos\/(\d+)$/);
    if (reposMatch && httpMethod === 'GET') {
      const installationId = reposMatch[1];
      app.getInstallationRepos(installationId).then(repos => {
        sendJSONResponse(res, { installationId, repos });
      }).catch(err => {
        sendJSONResponse(res, { error: err.message }, 500);
      });
      return true;
    }

    // POST /api/github/analyze/:owner/:repo — Trigger manual analysis
    const analyzeMatch = pathname.match(/^\/api\/github\/analyze\/([^/]+)\/([^/]+)$/);
    if (analyzeMatch && httpMethod === 'POST') {
      const [, owner, repo] = analyzeMatch;

      readRequestBody(req).then(body => {
        const installationId = body.installationId;
        if (!installationId) {
          sendJSONResponse(res, { error: 'installationId required in body' }, 400);
          return;
        }

        return app.analyzeRepo(installationId, owner, repo).then(result => {
          sendJSONResponse(res, result);
        });
      }).catch(err => {
        sendJSONResponse(res, { error: err.message }, 500);
      });
      return true;
    }

    // GET /api/github/status — App status
    if (pathname === '/api/github/status' && httpMethod === 'GET') {
      sendJSONResponse(res, app.getStatus());
      return true;
    }

    // Not a github route
    return false;
  };
}

// ─── Quick Setup ───

/**
 * Quick setup helper for GitHub App integration.
 * Creates the GitHubApp instance and returns the route handler.
 *
 * @param {object} options
 * @param {string} options.appId - GitHub App ID
 * @param {string} options.privateKey - PEM-encoded RSA private key
 * @param {string} [options.webhookSecret] - Webhook secret
 * @param {string} [options.clientId] - OAuth client ID
 * @param {string} [options.clientSecret] - OAuth client secret
 * @param {object} [options.oracle] - RemembranceOracle instance
 * @returns {{ app: GitHubApp, routes: Function }}
 */
function setupGitHubApp(options = {}) {
  const app = new GitHubApp(options);
  const routes = webhookRoutes(app);

  return { app, routes };
}

module.exports = { GitHubApp, webhookRoutes, setupGitHubApp };
