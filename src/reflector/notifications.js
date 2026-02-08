/**
 * Remembrance Self-Reflector — Discord / Slack Notifications
 *
 * Post PR links, coherence deltas, whispers, and healing summaries
 * to Discord or Slack channels via webhook URLs.
 *
 * 1. sendDiscordNotification — POST to Discord webhook
 * 2. sendSlackNotification — POST to Slack webhook
 * 3. formatDiscordEmbed — Rich embed for Discord
 * 4. formatSlackBlocks — Block Kit message for Slack
 * 5. notify — Unified: auto-detect platform from webhook URL
 * 6. notifyFromReport — Build message from reflector report and send
 *
 * Uses only Node.js built-ins (https module for webhook POST).
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { join } = require('path');
const { loadJSON, saveJSON, ensureDir, trimArray } = require('./utils');

// ─── HTTP POST Helper ───

/**
 * POST JSON to a URL. Returns a promise-like result via callback or sync wrapper.
 * Since the project is zero-dependency and uses sync patterns,
 * this returns a synchronous result using a blocking approach.
 *
 * @param {string} webhookUrl - Full URL to POST to
 * @param {object} payload - JSON body
 * @param {object} options - { timeoutMs }
 * @returns {object} { ok, status, error }
 */
function postJSON(webhookUrl, payload, options = {}) {
  const { timeoutMs = 10000 } = options;

  try {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const mod = url.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              body: data,
            });
          });
        }
      );

      req.on('error', (err) => {
        resolve({ ok: false, status: 0, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, error: 'Request timed out' });
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    return Promise.resolve({ ok: false, status: 0, error: err.message });
  }
}

// ─── Discord ───

/**
 * Build a Discord embed object from a reflector report.
 *
 * @param {object} report - Reflector/orchestration report
 * @param {object} options - { repoName, prUrl }
 * @returns {object} Discord embed object
 */
function formatDiscordEmbed(report, options = {}) {
  const { repoName = 'unknown', prUrl } = options;

  const coherenceBefore = report.coherence?.before ?? report.safety?.preCoherence ?? 0;
  const coherenceAfter = report.coherence?.after ?? report.safety?.coherenceGuard?.postCoherence ?? 0;
  const delta = coherenceAfter - coherenceBefore;
  const filesHealed = report.report?.filesHealed ?? report.healing?.filesHealed ?? 0;
  const whisper = extractWhisper(report);

  const color = delta > 0 ? 0x00cc66 : delta < 0 ? 0xcc3333 : 0x999999;
  const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);

  const fields = [
    { name: 'Coherence', value: `${coherenceBefore.toFixed(3)} → ${coherenceAfter.toFixed(3)} (${deltaStr})`, inline: true },
    { name: 'Files Healed', value: `${filesHealed}`, inline: true },
  ];

  if (prUrl) {
    fields.push({ name: 'Pull Request', value: `[View PR](${prUrl})`, inline: false });
  }

  if (whisper) {
    fields.push({ name: 'Whisper', value: whisper, inline: false });
  }

  return {
    embeds: [{
      title: `Remembrance Pull: ${repoName}`,
      description: `Healed ${filesHealed} file(s) with coherence delta ${deltaStr}.`,
      color,
      fields,
      footer: { text: 'Remembrance Self-Reflector Bot' },
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Send a notification to a Discord webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function sendDiscordNotification(webhookUrl, report, options = {}) {
  const embed = formatDiscordEmbed(report, options);
  return postJSON(webhookUrl, embed, { timeoutMs: options.timeoutMs });
}

// ─── Slack ───

/**
 * Build Slack Block Kit blocks from a reflector report.
 *
 * @param {object} report - Reflector/orchestration report
 * @param {object} options - { repoName, prUrl }
 * @returns {object} Slack message payload
 */
function formatSlackBlocks(report, options = {}) {
  const { repoName = 'unknown', prUrl } = options;

  const coherenceBefore = report.coherence?.before ?? report.safety?.preCoherence ?? 0;
  const coherenceAfter = report.coherence?.after ?? report.safety?.coherenceGuard?.postCoherence ?? 0;
  const delta = coherenceAfter - coherenceBefore;
  const filesHealed = report.report?.filesHealed ?? report.healing?.filesHealed ?? 0;
  const whisper = extractWhisper(report);
  const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);
  const emoji = delta > 0 ? ':chart_with_upwards_trend:' : delta < 0 ? ':chart_with_downwards_trend:' : ':heavy_minus_sign:';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Remembrance Pull: ${repoName}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Coherence:*\n${coherenceBefore.toFixed(3)} → ${coherenceAfter.toFixed(3)} (${deltaStr}) ${emoji}` },
        { type: 'mrkdwn', text: `*Files Healed:*\n${filesHealed}` },
      ],
    },
  ];

  if (whisper) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> _${whisper}_` },
    });
  }

  if (prUrl) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Pull Request' },
        url: prUrl,
        style: 'primary',
      }],
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Remembrance Self-Reflector Bot_' }],
  });

  return { blocks, text: `Remembrance Pull: ${repoName} — ${filesHealed} file(s) healed (${deltaStr})` };
}

/**
 * Send a notification to a Slack webhook.
 *
 * @param {string} webhookUrl - Slack incoming webhook URL
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function sendSlackNotification(webhookUrl, report, options = {}) {
  const payload = formatSlackBlocks(report, options);
  return postJSON(webhookUrl, payload, { timeoutMs: options.timeoutMs });
}

// ─── Unified Notify ───

/**
 * Auto-detect platform from webhook URL and send notification.
 *
 * @param {string} webhookUrl - Webhook URL (Discord or Slack)
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, platform, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function notify(webhookUrl, report, options = {}) {
  const platform = options.platform || detectPlatform(webhookUrl);

  if (platform === 'discord') {
    return sendDiscordNotification(webhookUrl, report, options);
  }
  if (platform === 'slack') {
    return sendSlackNotification(webhookUrl, report, options);
  }

  // Generic: try Slack-style payload
  return sendSlackNotification(webhookUrl, report, options);
}

/**
 * Detect the platform from a webhook URL.
 */
function detectPlatform(webhookUrl) {
  if (!webhookUrl) return 'unknown';
  if (webhookUrl.includes('discord.com') || webhookUrl.includes('discordapp.com')) return 'discord';
  if (webhookUrl.includes('hooks.slack.com')) return 'slack';
  return 'generic';
}

// ─── Notify From Report ───

/**
 * Build a notification from a reflector report and send it.
 * Reads webhook config from central config.
 *
 * @param {string} rootDir - Repository root
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, webhookUrl, platform }
 * @returns {Promise<object>} Send result
 */
async function notifyFromReport(rootDir, report, options = {}) {
  const { loadCentralConfig } = require('./config');
  const config = loadCentralConfig(rootDir);

  const webhookUrl = options.webhookUrl
    || config.notifications?.webhookUrl
    || process.env.REFLECTOR_WEBHOOK_URL;

  if (!webhookUrl) {
    return { ok: false, error: 'No webhook URL configured. Set notifications.webhookUrl in central config or REFLECTOR_WEBHOOK_URL env var.' };
  }

  const repoName = options.repoName || config.notifications?.repoName || rootDir.split('/').pop();
  const platform = options.platform || config.notifications?.platform || detectPlatform(webhookUrl);

  const result = await notify(webhookUrl, report, { ...options, repoName, platform });

  // Record notification in history
  recordNotification(rootDir, {
    platform,
    webhookUrl: webhookUrl.slice(0, 40) + '...',
    ok: result.ok,
    status: result.status,
    error: result.error,
  });

  return result;
}

// ─── Notification History ───

function getNotificationLogPath(rootDir) {
  return join(rootDir, '.remembrance', 'notification-log.json');
}

function recordNotification(rootDir, entry) {
  ensureDir(join(rootDir, '.remembrance'));
  const logPath = getNotificationLogPath(rootDir);
  const log = loadJSON(logPath, []);
  log.push({ ...entry, timestamp: new Date().toISOString() });
  trimArray(log, 100);
  saveJSON(logPath, log);
}

function loadNotificationHistory(rootDir) {
  return loadJSON(getNotificationLogPath(rootDir), []);
}

function notificationStats(rootDir) {
  const log = loadNotificationHistory(rootDir);
  if (log.length === 0) return { total: 0, sent: 0, failed: 0, successRate: 0 };

  const sent = log.filter(e => e.ok).length;
  return {
    total: log.length,
    sent,
    failed: log.length - sent,
    successRate: Math.round(sent / log.length * 1000) / 1000,
    lastNotification: log[log.length - 1],
  };
}

// ─── Helpers ───

function extractWhisper(report) {
  if (typeof report.whisper === 'string') return report.whisper;
  if (report.whisper?.message) return report.whisper.message;
  if (typeof report.collectiveWhisper === 'string') return report.collectiveWhisper;
  if (report.collectiveWhisper?.message) return report.collectiveWhisper.message;
  if (report.report?.collectiveWhisper) return report.report.collectiveWhisper;
  return '';
}

module.exports = {
  postJSON,
  formatDiscordEmbed,
  sendDiscordNotification,
  formatSlackBlocks,
  sendSlackNotification,
  notify,
  detectPlatform,
  notifyFromReport,
  loadNotificationHistory,
  notificationStats,
  recordNotification,
};
