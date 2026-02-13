/**
 * Transpiler & AI CLI commands: transpile, verify-transpile, context, llm
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore } = require('../colors');

function registerTranspileCommands(handlers, { oracle, jsonOut }) {

  handlers['transpile'] = (args) => {
    const { transpile: astTranspile } = require('../../core/ast-transpiler');
    const targetLang = process.argv[3];
    const filePath = args.file || process.argv[4];
    if (!targetLang || !filePath) {
      console.log(`Usage: oracle transpile <language> --file <code.js>`);
      console.log(`  Languages: python, typescript, go, rust`);
      return;
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    const result = astTranspile(code, targetLang);
    if (result.success) {
      console.log(c.boldGreen(`Transpiled to ${targetLang} (AST-based):\n`));
      console.log(result.code);
      if (result.imports && result.imports.length > 0) {
        console.log(c.dim(`\nImports detected: ${result.imports.join(', ')}`));
      }
    } else {
      console.error(c.red(`Transpile failed: ${result.error}`));
    }
  };

  handlers['verify-transpile'] = handlers['vtranspile'] = (args) => {
    const { transpile: astTranspile, generateGoTest, generateRustTest, verifyTranspilation } = require('../../core/ast-transpiler');
    const targetLang = process.argv[3];
    const filePath = args.file || process.argv[4];
    if (!targetLang || !filePath) {
      console.log(`Usage: oracle verify-transpile <language> --file <code.js> [--test <test.js>]`);
      console.log(`  Languages: go, rust`);
      return;
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    const jsTestCode = args.test ? fs.readFileSync(args.test, 'utf-8') : null;
    const result = astTranspile(code, targetLang);
    if (!result.success) { console.error(c.red(`Transpile failed: ${result.error}`)); return; }

    console.log(c.boldGreen(`Transpiled to ${targetLang}:\n`));
    console.log(result.code);

    const funcMatch = code.match(/function\s+(\w+)/);
    const funcName = funcMatch ? funcMatch[1] : 'unknown';
    let testCode = null;
    if (jsTestCode) {
      testCode = targetLang === 'go' ? generateGoTest(result.code, jsTestCode, funcName) : generateRustTest(result.code, jsTestCode, funcName);
    }
    if (testCode) {
      console.log(c.boldCyan(`\nGenerated ${targetLang} test:\n`));
      console.log(testCode);
    }

    if (testCode) {
      console.log(c.dim('\nVerifying compilation...'));
      const check = verifyTranspilation(result.code, testCode, targetLang);
      if (check.compiled) {
        console.log(c.boldGreen('Compilation verified! Tests passed.'));
      } else {
        console.log(c.boldRed('Compilation failed:'));
        console.log(c.dim(check.output.slice(0, 500)));
      }
    }
  };

  handlers['context'] = handlers['export-context'] = (args) => {
    const format = args.format || process.argv[3] || 'markdown';
    const maxPatterns = parseInt(args.limit) || 50;
    const includeCode = args.code === 'true' || args.code === true;
    const output = args.output || args.file;

    const ctx = oracle.generateContext({ format, maxPatterns, includeCode });
    if (output) {
      fs.writeFileSync(output, ctx.prompt, 'utf-8');
      console.log(c.boldGreen(`Context exported to ${c.bold(output)}`));
      console.log(`  Format: ${format} | Patterns: ${ctx.stats.totalPatterns} | Languages: ${Object.keys(ctx.stats.byLanguage).join(', ')}`);
    } else {
      console.log(ctx.prompt);
    }
  };

  handlers['llm'] = (args) => {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Claude LLM Engine')}\n`);
      console.log(`  ${c.cyan('llm status')}                   Check if Claude is available`);
      console.log(`  ${c.cyan('llm transpile')} --id <id> --to <lang>  Transpile a pattern`);
      console.log(`  ${c.cyan('llm tests')} --id <id>          Generate tests for a pattern`);
      console.log(`  ${c.cyan('llm refine')} --id <id>         Refine a pattern's weak dimensions`);
      console.log(`  ${c.cyan('llm alternative')} --id <id>    Generate an alternative algorithm`);
      console.log(`  ${c.cyan('llm docs')} --id <id>           Generate documentation`);
      console.log(`  ${c.cyan('llm analyze')} --file <path>    Analyze code quality`);
      console.log(`  ${c.cyan('llm explain')} --id <id>        Explain a pattern in plain language`);
      console.log(`  ${c.cyan('llm generate')} [--max <n>]     LLM-enhanced candidate generation`);
      return;
    }

    if (sub === 'status') {
      const available = oracle.isLLMAvailable();
      if (available) {
        console.log(`${c.boldGreen('\u2713 Claude is available')} \u2014 native LLM engine active`);
        console.log(`  All llm commands will use Claude for generation.`);
      } else {
        console.log(`${c.yellow('\u26A0 Claude CLI not detected')}`);
        console.log(`  LLM commands will fall back to AST/reflection/regex methods.`);
        console.log(`  Install Claude Code: ${c.cyan('npm install -g @anthropic-ai/claude-code')}`);
      }
      return;
    }

    if (sub === 'transpile') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      if (!args.to) { console.error(c.boldRed('Error:') + ' --to <language> required'); process.exit(1); }
      const result = oracle.llmTranspile(args.id, args.to);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Transpiled')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Name:')} ${result.result.name}`);
        console.log(`  ${c.dim('Language:')} ${result.result.language}`);
        console.log(`\n${result.result.code}`);
      } else {
        console.error(`${c.boldRed('\u2717 Transpilation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'tests') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmGenerateTests(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Tests generated')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.testCode}`);
      } else {
        console.error(`${c.boldRed('\u2717 Test generation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'refine') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmRefine(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Refined')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.refinedCode}`);
      } else {
        console.error(`${c.boldRed('\u2717 Refinement failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'alternative') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmAlternative(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Alternative generated')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Name:')} ${result.alternative.name}`);
        console.log(`\n${result.alternative.code}`);
      } else {
        console.error(`${c.boldRed('\u2717 Alternative failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'docs') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmDocs(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Docs generated')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.docs}`);
      } else {
        console.error(`${c.boldRed('\u2717 Docs failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'analyze') {
      const code = args.file ? fs.readFileSync(args.file, 'utf8') : null;
      if (!code) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
      const lang = args.language || path.extname(args.file).slice(1) || 'javascript';
      const result = oracle.llmAnalyze(code, lang);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Analysis')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Quality:')} ${colorScore(result.analysis.quality || 0)}`);
        console.log(`  ${c.dim('Complexity:')} ${result.analysis.complexity}`);
        if (result.analysis.issues?.length) {
          console.log(`\n  ${c.bold('Issues:')}`);
          result.analysis.issues.forEach(i => console.log(`    ${i.severity === 'high' ? c.red('\u25CF') : c.yellow('\u25CF')} ${i.description}`));
        }
        if (result.analysis.suggestions?.length) {
          console.log(`\n  ${c.bold('Suggestions:')}`);
          result.analysis.suggestions.forEach(s => console.log(`    ${c.cyan('\u2192')} ${s}`));
        }
      } else {
        console.error(`${c.boldRed('\u2717 Analysis failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'explain') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmExplain(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('\u2713 Explanation')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.explanation}`);
      } else {
        console.error(`${c.boldRed('\u2717 Explanation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'generate') {
      const max = parseInt(args.max) || 10;
      console.log(`${c.dim('Generating LLM-enhanced candidates...')}`);
      const result = oracle.llmGenerate({ maxPatterns: max });
      console.log(`${c.boldGreen('\u2713 Generation complete')} via ${c.cyan(result.method)}`);
      console.log(`  ${c.dim('Generated:')} ${result.generated}  ${c.dim('Stored:')} ${result.stored}  ${c.dim('Promoted:')} ${result.promoted || 0}`);
      if (result.details?.length > 0 && result.details[0]?.name) {
        result.details.forEach(d => {
          const badge = d.promoted ? c.boldGreen('proven') : c.yellow('candidate');
          console.log(`  ${c.cyan('\u2192')} ${d.name} (${d.method}) [${badge}]`);
        });
      }
      return;
    }

    console.error(`${c.boldRed('Unknown llm subcommand:')} ${sub}. Run ${c.cyan('oracle llm help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerTranspileCommands };
