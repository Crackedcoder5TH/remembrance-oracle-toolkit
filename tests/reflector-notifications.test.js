const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');

const {
  formatDiscordEmbed,
  formatSlackBlocks,
  detectPlatform,
  recordNotification,
  loadNotificationHistory,
  notificationStats,
} = require('../src/reflector/report');

// ─── Helpers ───

const TEST_ROOT = join(__dirname, '__tmp_notifications_test__');

function setup() {
  mkdirSync(join(TEST_ROOT, '.remembrance'), { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── detectPlatform ───

describe('detectPlatform', () => {
  it('should detect Discord', () => {
    assert.equal(detectPlatform('https://discord.com/api/webhooks/123/abc'), 'discord');
    assert.equal(detectPlatform('https://discordapp.com/api/webhooks/123/abc'), 'discord');
  });

  it('should detect Slack', () => {
    assert.equal(detectPlatform('https://hooks.slack.com/services/T00/B00/xxxx'), 'slack');
  });

  it('should return generic for unknown URLs', () => {
    assert.equal(detectPlatform('https://example.com/webhook'), 'generic');
  });

  it('should return unknown for empty input', () => {
    assert.equal(detectPlatform(''), 'unknown');
    assert.equal(detectPlatform(null), 'unknown');
  });
});

// ─── formatDiscordEmbed ───

describe('formatDiscordEmbed', () => {
  it('should create an embed with coherence delta', () => {
    const result = formatDiscordEmbed({
      coherence: { before: 0.6, after: 0.8 },
      report: { filesHealed: 3 },
      whisper: 'The code grows stronger.',
    }, { repoName: 'my-repo' });

    assert.ok(result.embeds);
    assert.equal(result.embeds.length, 1);

    const embed = result.embeds[0];
    assert.ok(embed.title.includes('my-repo'));
    assert.ok(embed.description.includes('3'));
    assert.equal(embed.color, 0x00cc66); // Positive delta = green
    assert.ok(embed.fields.length >= 2);
    assert.ok(embed.footer.text.includes('Remembrance'));
    assert.ok(embed.timestamp);
  });

  it('should include PR URL when provided', () => {
    const result = formatDiscordEmbed(
      { coherence: { before: 0.7, after: 0.8 }, report: { filesHealed: 1 } },
      { prUrl: 'https://github.com/org/repo/pull/42' },
    );
    const prField = result.embeds[0].fields.find(f => f.name === 'Pull Request');
    assert.ok(prField);
    assert.ok(prField.value.includes('github.com'));
  });

  it('should include whisper field', () => {
    const result = formatDiscordEmbed({
      coherence: { before: 0.5, after: 0.5 },
      report: { filesHealed: 0 },
      whisper: 'Codebase is stable.',
    });
    const whisperField = result.embeds[0].fields.find(f => f.name === 'Whisper');
    assert.ok(whisperField);
    assert.ok(whisperField.value.includes('stable'));
  });

  it('should show red for negative delta', () => {
    const result = formatDiscordEmbed({
      coherence: { before: 0.8, after: 0.6 },
      report: { filesHealed: 2 },
    });
    assert.equal(result.embeds[0].color, 0xcc3333);
  });

  it('should show grey for zero delta', () => {
    const result = formatDiscordEmbed({
      coherence: { before: 0.7, after: 0.7 },
      report: { filesHealed: 0 },
    });
    assert.equal(result.embeds[0].color, 0x999999);
  });

  it('should handle safety.preCoherence fallback', () => {
    const result = formatDiscordEmbed({
      safety: { preCoherence: 0.65, coherenceGuard: { postCoherence: 0.75 } },
      report: { filesHealed: 1 },
    });
    assert.ok(result.embeds[0].fields[0].value.includes('0.650'));
    assert.ok(result.embeds[0].fields[0].value.includes('0.750'));
  });
});

// ─── formatSlackBlocks ───

describe('formatSlackBlocks', () => {
  it('should create blocks with header and coherence', () => {
    const result = formatSlackBlocks({
      coherence: { before: 0.6, after: 0.85 },
      report: { filesHealed: 5 },
      whisper: 'Moving forward.',
    }, { repoName: 'test-repo' });

    assert.ok(result.blocks);
    assert.ok(result.text);
    assert.ok(result.text.includes('test-repo'));

    const header = result.blocks.find(b => b.type === 'header');
    assert.ok(header);
    assert.ok(header.text.text.includes('test-repo'));

    const section = result.blocks.find(b => b.type === 'section' && b.fields);
    assert.ok(section);
    assert.ok(section.fields[0].text.includes('0.600'));
    assert.ok(section.fields[0].text.includes('0.850'));
  });

  it('should include PR button when prUrl provided', () => {
    const result = formatSlackBlocks(
      { coherence: { before: 0.7, after: 0.8 }, report: { filesHealed: 1 } },
      { prUrl: 'https://github.com/org/repo/pull/99' },
    );
    const actions = result.blocks.find(b => b.type === 'actions');
    assert.ok(actions);
    assert.ok(actions.elements[0].url.includes('github.com'));
  });

  it('should include whisper as blockquote', () => {
    const result = formatSlackBlocks({
      coherence: { before: 0.5, after: 0.6 },
      report: { filesHealed: 1 },
      collectiveWhisper: { message: 'Growing steadily.' },
    });
    const whisperBlock = result.blocks.find(b => b.type === 'section' && b.text?.text?.includes('Growing'));
    assert.ok(whisperBlock);
  });

  it('should include context footer', () => {
    const result = formatSlackBlocks({
      coherence: { before: 0.7, after: 0.7 },
      report: { filesHealed: 0 },
    });
    const context = result.blocks.find(b => b.type === 'context');
    assert.ok(context);
    assert.ok(context.elements[0].text.includes('Remembrance'));
  });

  it('should include chart emoji for positive delta', () => {
    const result = formatSlackBlocks({
      coherence: { before: 0.6, after: 0.8 },
      report: { filesHealed: 2 },
    });
    const section = result.blocks.find(b => b.type === 'section' && b.fields);
    assert.ok(section.fields[0].text.includes(':chart_with_upwards_trend:'));
  });
});

// ─── Notification History & Stats ───

describe('notificationStats', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return zero stats for no history', () => {
    const stats = notificationStats(TEST_ROOT);
    assert.equal(stats.total, 0);
    assert.equal(stats.sent, 0);
    assert.equal(stats.failed, 0);
  });

  it('should record and compute stats', () => {
    recordNotification(TEST_ROOT, { platform: 'discord', ok: true, status: 204 });
    recordNotification(TEST_ROOT, { platform: 'slack', ok: true, status: 200 });
    recordNotification(TEST_ROOT, { platform: 'discord', ok: false, error: 'timeout' });

    const stats = notificationStats(TEST_ROOT);
    assert.equal(stats.total, 3);
    assert.equal(stats.sent, 2);
    assert.equal(stats.failed, 1);
    assert.ok(stats.successRate > 0.6);
    assert.ok(stats.lastNotification);
  });

  it('should load notification history', () => {
    recordNotification(TEST_ROOT, { platform: 'slack', ok: true });
    const history = loadNotificationHistory(TEST_ROOT);
    assert.equal(history.length, 1);
    assert.equal(history[0].platform, 'slack');
    assert.ok(history[0].timestamp);
  });
});

// ─── Exports ───

describe('Notifications — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorNotify, 'function');
    assert.strictEqual(typeof index.reflectorNotifyFromReport, 'function');
    assert.strictEqual(typeof index.reflectorFormatDiscordEmbed, 'function');
    assert.strictEqual(typeof index.reflectorFormatSlackBlocks, 'function');
    assert.strictEqual(typeof index.reflectorDetectPlatform, 'function');
    assert.strictEqual(typeof index.reflectorNotificationStats, 'function');
    assert.strictEqual(typeof index.reflectorLoadNotificationHistory, 'function');
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Notifications — reflector functions (MCP consolidated)', () => {
  it('notify and notification functions are directly importable', () => {
    const report = require('../src/reflector/report');
    assert.strictEqual(typeof report.notify, 'function');
    assert.strictEqual(typeof report.notifyFromReport, 'function');
    assert.strictEqual(typeof report.notificationStats, 'function');
    assert.strictEqual(typeof report.formatDiscordEmbed, 'function');
    assert.strictEqual(typeof report.formatSlackBlocks, 'function');
    assert.strictEqual(typeof report.detectPlatform, 'function');
  });

  it('MCP has 12 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 12);
  });
});
