/**
 * CI Plugin — opt-in CI/CD hooks and automation.
 *
 * Provides git hooks, CI feedback tracking, auto-seed, harvest, and auto-submit.
 * Load via: pluginManager.load(require('./builtins/ci-plugin'))
 */

module.exports = {
  name: 'ci',
  version: '1.0.0',
  description: 'CI/CD integration: git hooks, feedback tracking, auto-seed, harvest, auto-submit',
  author: 'remembrance-oracle',
  hooks: ['afterSubmit', 'patternRegistered'],

  activate(ctx) {
    const { CIFeedbackReporter, wrapWithTracking } = require('../../ci/feedback');
    const { discoverPatterns, autoSeed } = require('../../ci/auto-seed');
    const { harvest, harvestFunctions, splitFunctions } = require('../../ci/harvest');
    const { installHooks, uninstallHooks, runPreCommitCheck } = require('../../ci/hooks');
    const { autoSubmit } = require('../../ci/auto-submit');

    ctx.oracle._ciFactory = {
      CIFeedbackReporter, wrapWithTracking,
      discoverPatterns, autoSeed,
      harvest, harvestFunctions, splitFunctions,
      installHooks, uninstallHooks, runPreCommitCheck,
      autoSubmit,
    };

    ctx.logger.info('CI plugin activated — git hooks and automation available');

    return function deactivate() {
      delete ctx.oracle._ciFactory;
      ctx.logger.info('CI plugin deactivated');
    };
  },

  get exports() {
    return {
      ...require('../../ci/feedback'),
      ...require('../../ci/auto-seed'),
      ...require('../../ci/harvest'),
      ...require('../../ci/hooks'),
      ...require('../../ci/auto-submit'),
    };
  },
};
