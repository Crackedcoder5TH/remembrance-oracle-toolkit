/**
 * Platform CLI commands: billing, landing, github-app
 *
 * Covers the commercialization pillars:
 * - Stripe billing integration (subscriptions + webhook management)
 * - Marketing landing page server
 * - GitHub App for organic discovery
 */

const { c } = require('../colors');

function registerPlatformCommands(handlers, { oracle, jsonOut }) {

  // ─── Billing ───

  handlers['billing'] = (args) => {
    const sub = process.argv[3];

    if (sub === 'status' || !sub) {
      const { BillingManager, StripeClient, PLANS } = require('../../billing/stripe');
      const hasKey = !!process.env.STRIPE_SECRET_KEY;

      console.log(`\n${c.boldCyan('Billing Status')}\n`);
      console.log(`  Stripe key:  ${hasKey ? c.green('configured') : c.yellow('not set (STRIPE_SECRET_KEY)')}`);
      console.log(`  Webhook:     ${process.env.STRIPE_WEBHOOK_SECRET ? c.green('configured') : c.yellow('not set')}`);
      console.log(`\n${c.bold('Plans:')}`);
      for (const [key, plan] of Object.entries(PLANS)) {
        const limit = plan.patterns === -1 ? 'unlimited' : plan.patterns;
        console.log(`  ${c.cyan(key.padEnd(8))} ${plan.name.padEnd(8)} — ${limit} patterns, ${plan.members === -1 ? 'unlimited' : plan.members} members`);
        console.log(`           ${c.dim(plan.features.join(', '))}`);
      }
    } else if (sub === 'plans') {
      const { PLANS } = require('../../billing/stripe');
      if (jsonOut()) { console.log(JSON.stringify(PLANS)); return; }
      console.log(`\n${c.boldCyan('Available Plans')}\n`);
      for (const [key, plan] of Object.entries(PLANS)) {
        const limit = plan.patterns === -1 ? 'unlimited' : plan.patterns;
        const members = plan.members === -1 ? 'unlimited' : plan.members;
        console.log(`  ${c.bold(plan.name)} (${c.cyan(key)})`);
        console.log(`    Patterns: ${c.bold(String(limit))}`);
        console.log(`    Members:  ${c.bold(String(members))}`);
        console.log(`    Features: ${plan.features.map(f => c.blue(f)).join(', ')}`);
        console.log('');
      }
    } else if (sub === 'webhook') {
      const { StripeClient, BillingManager, billingRoutes } = require('../../billing/stripe');
      const port = parseInt(args.port) || 3456;

      if (!process.env.STRIPE_SECRET_KEY) {
        console.error(c.boldRed('Error:') + ' STRIPE_SECRET_KEY env var is required');
        process.exit(1);
      }

      const http = require('http');
      const stripe = new StripeClient();
      let billing;
      try {
        const sqliteStore = oracle.store.getSQLiteStore();
        billing = new BillingManager(stripe, sqliteStore);
      } catch {
        console.error(c.boldRed('Error:') + ' SQLite store required for billing');
        process.exit(1);
      }

      const routes = billingRoutes(billing);
      const server = http.createServer((req, res) => {
        const parsedUrl = require('url').parse(req.url, true);
        const handled = routes(req, res, parsedUrl.pathname, req.method);
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      server.listen(port, () => {
        console.log(`${c.boldGreen('Billing webhook server')} listening on port ${c.bold(String(port))}`);
        console.log(`  Webhook URL: ${c.cyan(`http://localhost:${port}/api/billing/webhook`)}`);
        console.log(`  Plan info:   ${c.cyan(`http://localhost:${port}/api/billing/plan`)}`);
        console.log(`\n  ${c.dim('Use Stripe CLI to forward webhooks:')}`);
        console.log(`  ${c.dim(`stripe listen --forward-to localhost:${port}/api/billing/webhook`)}`);
      });
    } else {
      console.log(`\n${c.boldCyan('Billing Commands')}\n`);
      console.log(`  ${c.cyan('oracle billing')}          — Show billing status`);
      console.log(`  ${c.cyan('oracle billing status')}   — Show billing configuration`);
      console.log(`  ${c.cyan('oracle billing plans')}    — List available plans`);
      console.log(`  ${c.cyan('oracle billing webhook')}  — Start webhook listener server`);
      console.log(`\n${c.bold('Required env vars:')}`);
      console.log(`  ${c.yellow('STRIPE_SECRET_KEY')}         — Stripe API secret key`);
      console.log(`  ${c.yellow('STRIPE_WEBHOOK_SECRET')}     — Stripe webhook signing secret`);
    }
  };

  // ─── Landing Page ───

  handlers['landing'] = (args) => {
    const sub = process.argv[3];

    if (sub === 'start' || !sub) {
      const { startLanding } = require('../../landing/server');
      const port = parseInt(args.port) || 3000;
      const host = args.host || '0.0.0.0';

      console.log(`${c.boldCyan('Starting Landing Page')} on ${host}:${port}\n`);

      startLanding({ port, host, oracle }).then(({ server, address }) => {
        console.log(`${c.boldGreen('Landing Page')} live at ${c.cyan(`http://localhost:${address.port}`)}\n`);
        console.log(`  ${c.bold('Routes:')}`);
        console.log(`    Page:      ${c.cyan(`http://localhost:${address.port}/`)}`);
        console.log(`    Stats:     ${c.cyan(`http://localhost:${address.port}/api/stats`)}`);
        console.log(`    Waitlist:  ${c.cyan(`POST http://localhost:${address.port}/api/waitlist`)}`);
        console.log(`    Health:    ${c.cyan(`http://localhost:${address.port}/health`)}`);
        console.log(`\n  ${c.dim('Press Ctrl+C to stop')}`);
      }).catch(err => {
        console.error(`${c.boldRed('Error:')} ${err.message}`);
        process.exit(1);
      });
    } else if (sub === 'waitlist') {
      // Show waitlist stats
      try {
        const { DatabaseSync } = require('node:sqlite');
        const path = require('path');
        const dbPath = path.join(process.cwd(), '.remembrance', 'landing.db');
        const db = new DatabaseSync(dbPath);
        const count = db.prepare('SELECT COUNT(*) as count FROM waitlist').get();
        const recent = db.prepare('SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 10').all();
        console.log(`\n${c.boldCyan('Waitlist')}\n`);
        console.log(`  Total signups: ${c.bold(String(count.count))}\n`);
        if (recent.length > 0) {
          console.log(`${c.bold('Recent:')}`);
          for (const entry of recent) {
            console.log(`  ${c.dim(entry.created_at)} ${entry.email}`);
          }
        }
      } catch {
        console.log(c.dim('No waitlist data found. Start the landing page first.'));
      }
    } else {
      console.log(`\n${c.boldCyan('Landing Page Commands')}\n`);
      console.log(`  ${c.cyan('oracle landing')}            — Start the landing page server`);
      console.log(`  ${c.cyan('oracle landing start')}      — Start the landing page server`);
      console.log(`  ${c.cyan('oracle landing waitlist')}   — Show waitlist signups`);
      console.log(`\n${c.bold('Options:')}`);
      console.log(`  ${c.yellow('--port <n>')}     — Port (default: 3000)`);
      console.log(`  ${c.yellow('--host <addr>')} — Host (default: 0.0.0.0)`);
    }
  };

  // ─── GitHub App ───

  handlers['github-app'] = (args) => {
    const sub = process.argv[3];

    if (sub === 'start' || sub === 'webhook') {
      const { setupGitHubApp } = require('../../github/app');
      const port = parseInt(args.port) || 3457;

      const { app, routes } = setupGitHubApp({ oracle });

      const http = require('http');
      const server = http.createServer((req, res) => {
        const parsedUrl = require('url').parse(req.url, true);
        const handled = routes(req, res, parsedUrl.pathname, req.method);
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      server.listen(port, () => {
        console.log(`${c.boldGreen('GitHub App')} webhook server on port ${c.bold(String(port))}\n`);
        console.log(`  ${c.bold('Endpoints:')}`);
        console.log(`    Webhook:       ${c.cyan(`http://localhost:${port}/api/github/webhook`)}`);
        console.log(`    Status:        ${c.cyan(`http://localhost:${port}/api/github/status`)}`);
        console.log(`    Installations: ${c.cyan(`http://localhost:${port}/api/github/installations`)}`);
        console.log(`\n  ${c.dim('Configure this URL in your GitHub App settings.')}`);
        console.log(`  ${c.dim('Press Ctrl+C to stop')}`);
      });
    } else if (sub === 'status' || !sub) {
      const configured = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
      console.log(`\n${c.boldCyan('GitHub App Status')}\n`);
      console.log(`  App ID:         ${process.env.GITHUB_APP_ID ? c.green(process.env.GITHUB_APP_ID) : c.yellow('not set (GITHUB_APP_ID)')}`);
      console.log(`  Private Key:    ${process.env.GITHUB_APP_PRIVATE_KEY ? c.green('configured') : c.yellow('not set (GITHUB_APP_PRIVATE_KEY)')}`);
      console.log(`  Webhook Secret: ${process.env.GITHUB_APP_WEBHOOK_SECRET ? c.green('configured') : c.yellow('not set')}`);
      console.log(`  Client ID:      ${process.env.GITHUB_APP_CLIENT_ID ? c.green('configured') : c.yellow('not set')}`);
      console.log(`  Client Secret:  ${process.env.GITHUB_APP_CLIENT_SECRET ? c.green('configured') : c.yellow('not set')}`);
      console.log(`\n  ${configured ? c.green('Ready to start') : c.yellow('Set env vars to configure')}`);
    } else if (sub === 'setup') {
      console.log(`\n${c.boldCyan('GitHub App Setup Guide')}\n`);
      console.log(`  1. Go to ${c.cyan('https://github.com/settings/apps/new')}`);
      console.log(`  2. Set the webhook URL to your server endpoint`);
      console.log(`  3. Enable these permissions:`);
      console.log(`     - ${c.bold('Repository')}: Contents (read), Pull requests (write), Checks (write), Issues (write)`);
      console.log(`     - ${c.bold('Organization')}: Members (read)`);
      console.log(`  4. Subscribe to events: push, pull_request, issues, check_suite, installation`);
      console.log(`  5. Generate a private key and download it`);
      console.log(`  6. Set environment variables:`);
      console.log(`     ${c.yellow('GITHUB_APP_ID')}='<your-app-id>'`);
      console.log(`     ${c.yellow('GITHUB_APP_PRIVATE_KEY')}='<contents of .pem file>'`);
      console.log(`     ${c.yellow('GITHUB_APP_WEBHOOK_SECRET')}='<your-webhook-secret>'`);
      console.log(`  7. Run: ${c.cyan('oracle github-app start')}`);
    } else {
      console.log(`\n${c.boldCyan('GitHub App Commands')}\n`);
      console.log(`  ${c.cyan('oracle github-app')}          — Show GitHub App status`);
      console.log(`  ${c.cyan('oracle github-app status')}   — Show configuration status`);
      console.log(`  ${c.cyan('oracle github-app start')}    — Start webhook server`);
      console.log(`  ${c.cyan('oracle github-app setup')}    — Show setup guide`);
      console.log(`\n${c.bold('Required env vars:')}`);
      console.log(`  ${c.yellow('GITHUB_APP_ID')}              — GitHub App ID`);
      console.log(`  ${c.yellow('GITHUB_APP_PRIVATE_KEY')}     — RSA private key (.pem)`);
      console.log(`  ${c.yellow('GITHUB_APP_WEBHOOK_SECRET')}  — Webhook signing secret`);
    }
  };
}

module.exports = { registerPlatformCommands };
