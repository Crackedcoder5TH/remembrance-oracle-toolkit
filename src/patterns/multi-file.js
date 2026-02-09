/**
 * Multi-File Pattern Support
 *
 * Extends the pattern system to handle multi-file modules:
 *   - ModulePattern: a pattern composed of multiple files with a dependency graph
 *   - TemplateEngine: variable interpolation + conditional sections in patterns
 *   - DependencyGraph: topological sort, cycle detection, impact analysis
 *   - Scaffolding: generate project structures from module patterns
 */

const crypto = require('crypto');

// ─── Module Pattern ───

/**
 * A multi-file pattern: a set of related files that form a cohesive module.
 *
 * @typedef {object} FileEntry
 * @property {string} path    - Relative path (e.g. "src/utils/debounce.js")
 * @property {string} code    - File contents
 * @property {string} [language] - Language override (auto-detected if omitted)
 * @property {string} [role]  - "main" | "test" | "config" | "types" | "docs"
 *
 * @typedef {object} ModulePatternInput
 * @property {string} name        - Module name
 * @property {string} description - What the module does
 * @property {FileEntry[]} files  - The files that make up this module
 * @property {string[]} [tags]    - Searchable tags
 * @property {string[]} [requires] - IDs of other patterns this depends on
 * @property {object} [template]  - Template variables { varName: defaultValue }
 */

class ModulePattern {
  /**
   * @param {ModulePatternInput} input
   */
  constructor(input) {
    if (!input.name) throw new Error('Module name required');
    if (!input.files || input.files.length === 0) throw new Error('At least one file required');

    this.id = input.id || this._generateId(input);
    this.name = input.name;
    this.description = input.description || '';
    this.files = input.files.map(f => ({
      path: f.path,
      code: f.code,
      language: f.language || detectFileLanguage(f.path),
      role: f.role || inferFileRole(f.path),
    }));
    this.tags = input.tags || [];
    this.requires = input.requires || [];
    this.template = input.template || {};
    this.createdAt = input.createdAt || new Date().toISOString();
    this.updatedAt = input.updatedAt || this.createdAt;
  }

  _generateId(input) {
    const hash = crypto.createHash('sha256');
    hash.update(input.name + ':' + input.files.map(f => f.path + f.code).join('|'));
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Get the main entry file.
   */
  getMain() {
    return this.files.find(f => f.role === 'main') || this.files[0];
  }

  /**
   * Get test files.
   */
  getTests() {
    return this.files.filter(f => f.role === 'test');
  }

  /**
   * Get the internal dependency graph (which files import which).
   */
  getDependencyGraph() {
    const graph = new DependencyGraph();
    for (const file of this.files) {
      graph.addNode(file.path);
    }
    // Parse imports to find internal dependencies
    const filePaths = new Set(this.files.map(f => f.path));
    for (const file of this.files) {
      const imports = extractImports(file.code, file.language);
      for (const imp of imports) {
        const resolved = resolveImport(imp, file.path, filePaths);
        if (resolved) {
          graph.addEdge(file.path, resolved);
        }
      }
    }
    return graph;
  }

  /**
   * Serialize to a storable object.
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      files: this.files,
      tags: this.tags,
      requires: this.requires,
      template: this.template,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      type: 'module',
    };
  }

  /**
   * Reconstruct from stored object.
   */
  static fromJSON(obj) {
    return new ModulePattern(obj);
  }
}


// ─── Dependency Graph ───

class DependencyGraph {
  constructor() {
    this._adjacency = new Map();  // node → Set<node>
    this._reverse = new Map();    // node → Set<incoming nodes>
  }

  addNode(node) {
    if (!this._adjacency.has(node)) {
      this._adjacency.set(node, new Set());
      this._reverse.set(node, new Set());
    }
  }

  addEdge(from, to) {
    this.addNode(from);
    this.addNode(to);
    this._adjacency.get(from).add(to);
    this._reverse.get(to).add(from);
  }

  /**
   * Get all nodes.
   */
  nodes() {
    return Array.from(this._adjacency.keys());
  }

  /**
   * Get direct dependencies of a node.
   */
  dependenciesOf(node) {
    return Array.from(this._adjacency.get(node) || []);
  }

  /**
   * Get nodes that depend on this node.
   */
  dependentsOf(node) {
    return Array.from(this._reverse.get(node) || []);
  }

  /**
   * Topological sort — returns files in dependency order.
   * Throws if there are cycles.
   */
  topologicalSort() {
    const visited = new Set();
    const visiting = new Set();
    const result = [];

    const visit = (node) => {
      if (visited.has(node)) return;
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected involving: ${node}`);
      }
      visiting.add(node);
      for (const dep of this._adjacency.get(node) || []) {
        visit(dep);
      }
      visiting.delete(node);
      visited.add(node);
      result.push(node);
    };

    for (const node of this._adjacency.keys()) {
      visit(node);
    }
    return result;
  }

  /**
   * Detect cycles. Returns array of cycle paths, or empty if none.
   */
  detectCycles() {
    const cycles = [];
    const visited = new Set();
    const path = [];
    const pathSet = new Set();

    const dfs = (node) => {
      if (visited.has(node)) return;
      if (pathSet.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push([...path.slice(cycleStart), node]);
        return;
      }
      pathSet.add(node);
      path.push(node);
      for (const dep of this._adjacency.get(node) || []) {
        dfs(dep);
      }
      path.pop();
      pathSet.delete(node);
      visited.add(node);
    };

    for (const node of this._adjacency.keys()) {
      dfs(node);
    }
    return cycles;
  }

  /**
   * Impact analysis — what would be affected if this node changes?
   * Returns all transitive dependents.
   */
  impactOf(node) {
    const affected = new Set();
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const dep of this._reverse.get(current) || []) {
        if (!affected.has(dep)) {
          affected.add(dep);
          queue.push(dep);
        }
      }
    }
    return Array.from(affected);
  }

  /**
   * Get leaf nodes (no dependencies).
   */
  leaves() {
    return this.nodes().filter(n => this._adjacency.get(n).size === 0);
  }

  /**
   * Get root nodes (nothing depends on them).
   */
  roots() {
    return this.nodes().filter(n => this._reverse.get(n).size === 0);
  }

  /**
   * Compute depth of each node (longest path from root).
   */
  depths() {
    const depths = new Map();
    const sorted = this.topologicalSort();
    for (const node of sorted) {
      const deps = this.dependenciesOf(node);
      if (deps.length === 0) {
        depths.set(node, 0);
      } else {
        depths.set(node, Math.max(...deps.map(d => (depths.get(d) || 0) + 1)));
      }
    }
    return Object.fromEntries(depths);
  }
}


// ─── Template Engine ───

class TemplateEngine {
  /**
   * Apply template variables to code.
   *
   * Supported syntax:
   *   {{varName}}        — simple replacement
   *   {{#if varName}}...{{/if}}  — conditional block
   *   {{#each items}}...{{/each}} — loop (items must be an array)
   *   {{UPPER_CASE}}     — constant-style variable
   *
   * @param {string} template - Template string with {{var}} placeholders
   * @param {object} variables - Variable values
   * @returns {string} Rendered output
   */
  static render(template, variables = {}) {
    let result = template;

    // Process conditionals first: {{#if var}}...{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, varName, content) => {
        return variables[varName] ? content : '';
      }
    );

    // Process each loops: {{#each var}}...{{/each}}
    result = result.replace(
      /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_, varName, content) => {
        const items = variables[varName];
        if (!Array.isArray(items)) return '';
        return items.map(item => {
          if (typeof item === 'string') {
            return content.replace(/\{\{this\}\}/g, item);
          }
          let rendered = content;
          for (const [key, val] of Object.entries(item)) {
            rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
          }
          return rendered;
        }).join('');
      }
    );

    // Process simple variable replacements: {{varName}}
    result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? String(variables[varName]) : match;
    });

    return result;
  }

  /**
   * Extract template variables from a template string.
   */
  static extractVariables(template) {
    const vars = new Set();
    const varPattern = /\{\{(\w+)\}\}/g;
    const ifPattern = /\{\{#if\s+(\w+)\}\}/g;
    const eachPattern = /\{\{#each\s+(\w+)\}\}/g;

    let match;
    while ((match = varPattern.exec(template)) !== null) {
      if (match[1] !== 'this') vars.add(match[1]);
    }
    while ((match = ifPattern.exec(template)) !== null) {
      vars.add(match[1]);
    }
    while ((match = eachPattern.exec(template)) !== null) {
      vars.add(match[1]);
    }

    return Array.from(vars);
  }

  /**
   * Validate that all required variables are provided.
   */
  static validate(template, variables) {
    const required = TemplateEngine.extractVariables(template);
    const missing = required.filter(v => variables[v] === undefined);
    return {
      valid: missing.length === 0,
      missing,
      provided: Object.keys(variables),
      required,
    };
  }
}


// ─── Module Store ───

class ModuleStore {
  constructor(options = {}) {
    this._modules = new Map();
    this.storeDir = options.storeDir || '.remembrance';
  }

  /**
   * Save a module pattern.
   */
  save(modulePattern) {
    if (!(modulePattern instanceof ModulePattern)) {
      modulePattern = new ModulePattern(modulePattern);
    }
    modulePattern.updatedAt = new Date().toISOString();
    this._modules.set(modulePattern.id, modulePattern);
    return modulePattern;
  }

  /**
   * Get a module by ID.
   */
  get(id) {
    return this._modules.get(id) || null;
  }

  /**
   * List all modules.
   */
  list(options = {}) {
    let modules = Array.from(this._modules.values());

    if (options.tag) {
      modules = modules.filter(m => m.tags.includes(options.tag));
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      modules = modules.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return modules.map(m => m.toJSON());
  }

  /**
   * Delete a module.
   */
  delete(id) {
    return this._modules.delete(id);
  }

  /**
   * Get stats.
   */
  stats() {
    const modules = Array.from(this._modules.values());
    const totalFiles = modules.reduce((sum, m) => sum + m.files.length, 0);
    const languages = new Set();
    for (const m of modules) {
      for (const f of m.files) {
        languages.add(f.language);
      }
    }
    return {
      totalModules: modules.length,
      totalFiles,
      languages: Array.from(languages),
      avgFilesPerModule: modules.length > 0 ? (totalFiles / modules.length).toFixed(1) : 0,
    };
  }
}


// ─── Scaffolding ───

/**
 * Generate a file structure from a module pattern + template variables.
 *
 * @param {ModulePattern} modulePattern - The module to scaffold
 * @param {object} variables - Template variable values
 * @param {object} options - { outputDir: string, dryRun: boolean }
 * @returns {object[]} Array of { path, code, language, role } for each generated file
 */
function scaffold(modulePattern, variables = {}, options = {}) {
  const files = [];
  const prefix = options.outputDir || '';

  for (const file of modulePattern.files) {
    const renderedPath = TemplateEngine.render(file.path, variables);
    const renderedCode = TemplateEngine.render(file.code, variables);

    files.push({
      path: prefix ? `${prefix}/${renderedPath}` : renderedPath,
      code: renderedCode,
      language: file.language,
      role: file.role,
    });
  }

  return files;
}

/**
 * Compose multiple module patterns into a single project structure.
 *
 * @param {ModulePattern[]} modules - Modules to compose
 * @param {object} variables - Shared template variables
 * @returns {object} { files: FileEntry[], graph: DependencyGraph }
 */
function compose(modules, variables = {}) {
  const allFiles = [];
  const graph = new DependencyGraph();
  const seenPaths = new Set();

  for (const mod of modules) {
    graph.addNode(mod.id);

    for (const req of mod.requires) {
      const depMod = modules.find(m => m.id === req);
      if (depMod) {
        graph.addEdge(mod.id, depMod.id);
      }
    }

    for (const file of mod.files) {
      const renderedPath = TemplateEngine.render(file.path, variables);
      if (seenPaths.has(renderedPath)) continue; // Skip duplicates
      seenPaths.add(renderedPath);

      allFiles.push({
        path: renderedPath,
        code: TemplateEngine.render(file.code, variables),
        language: file.language,
        role: file.role,
        module: mod.name,
      });
    }
  }

  // Verify no circular module dependencies
  const cycles = graph.detectCycles();
  if (cycles.length > 0) {
    throw new Error(`Circular module dependencies: ${cycles[0].join(' → ')}`);
  }

  return { files: allFiles, graph };
}


// ─── Helpers ───

function detectFileLanguage(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', pyw: 'python',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    java: 'java',
    c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    php: 'php',
    sh: 'shell', bash: 'shell',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', txt: 'text',
    html: 'html', css: 'css', scss: 'scss',
    sql: 'sql',
    dockerfile: 'docker',
    toml: 'toml',
  };
  return map[ext] || 'unknown';
}

function inferFileRole(filePath) {
  const lower = filePath.toLowerCase();
  if (/\.test\.|\.spec\.|__tests__/.test(lower)) return 'test';
  if (/\.d\.ts$|types?\.(ts|js)$/.test(lower)) return 'types';
  if (/readme|docs?\/|\.md$/.test(lower)) return 'docs';
  if (/config|\.json$|\.ya?ml$|\.toml$|\.env/.test(lower)) return 'config';
  if (/index\.|main\.|entry\.|app\./.test(lower)) return 'main';
  return 'source';
}

/**
 * Extract import/require paths from code.
 */
function extractImports(code, language) {
  const imports = [];

  if (language === 'javascript' || language === 'typescript') {
    // require('...')
    const reqPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = reqPattern.exec(code)) !== null) {
      imports.push(match[1]);
    }
    // import ... from '...'
    const impPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    while ((match = impPattern.exec(code)) !== null) {
      imports.push(match[1]);
    }
  } else if (language === 'python') {
    // from X import Y  or  import X
    const pyPattern = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
    let match;
    while ((match = pyPattern.exec(code)) !== null) {
      imports.push(match[1] || match[2]);
    }
  } else if (language === 'go') {
    const goPattern = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
    let match;
    while ((match = goPattern.exec(code)) !== null) {
      if (match[2]) {
        imports.push(match[2]);
      } else if (match[1]) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const m = line.match(/"([^"]+)"/);
          if (m) imports.push(m[1]);
        }
      }
    }
  }

  return imports;
}

/**
 * Resolve a relative import to a file path in the module.
 */
function resolveImport(importPath, fromFile, knownPaths) {
  // Skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null;

  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.split('/');
  const resolved = [];

  // Start from the directory of the importing file
  if (fromDir) resolved.push(...fromDir.split('/'));

  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { resolved.pop(); continue; }
    resolved.push(part);
  }

  const candidate = resolved.join('/');

  // Try exact match
  if (knownPaths.has(candidate)) return candidate;

  // Try common extensions
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.py', '.go'];
  for (const ext of extensions) {
    if (knownPaths.has(candidate + ext)) return candidate + ext;
  }

  // Try index file
  for (const ext of extensions) {
    if (knownPaths.has(candidate + '/index' + ext)) return candidate + '/index' + ext;
  }

  return null;
}


module.exports = {
  ModulePattern,
  DependencyGraph,
  TemplateEngine,
  ModuleStore,
  scaffold,
  compose,
  detectFileLanguage,
  inferFileRole,
  extractImports,
  resolveImport,
};
