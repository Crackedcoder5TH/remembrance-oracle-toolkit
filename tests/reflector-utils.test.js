const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, existsSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const { ensureDir, loadJSON, saveJSON, trimArray } = require('../src/reflector/scoring');

// ── Temp directory helper ──

function makeTempDir() {
  const dir = join(tmpdir(), `reflector-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('reflector utils — ensureDir', () => {
  it('should create a directory if it does not exist', () => {
    const dir = join(tmpdir(), `ensure-test-${Date.now()}`);
    assert.ok(!existsSync(dir));
    ensureDir(dir);
    assert.ok(existsSync(dir));
    rmSync(dir, { recursive: true });
  });

  it('should be idempotent if directory already exists', () => {
    const dir = makeTempDir();
    ensureDir(dir); // No error
    assert.ok(existsSync(dir));
    rmSync(dir, { recursive: true });
  });

  it('should create nested directories', () => {
    const base = join(tmpdir(), `ensure-nested-${Date.now()}`);
    const dir = join(base, 'a', 'b', 'c');
    ensureDir(dir);
    assert.ok(existsSync(dir));
    rmSync(base, { recursive: true });
  });
});

describe('reflector utils — loadJSON', () => {
  it('should return fallback when file does not exist', () => {
    const result = loadJSON('/nonexistent/path.json', { default: true });
    assert.deepStrictEqual(result, { default: true });
  });

  it('should return null when no fallback given', () => {
    const result = loadJSON('/nonexistent/path.json');
    assert.strictEqual(result, null);
  });

  it('should load valid JSON from disk', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'test.json');
    writeFileSync(filePath, JSON.stringify({ key: 'value' }));
    const result = loadJSON(filePath, {});
    assert.deepStrictEqual(result, { key: 'value' });
    rmSync(dir, { recursive: true });
  });

  it('should return fallback on corrupt JSON', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'bad.json');
    writeFileSync(filePath, 'not json!!!');
    const result = loadJSON(filePath, []);
    assert.deepStrictEqual(result, []);
    rmSync(dir, { recursive: true });
  });

  it('should return deep copy of fallback (not reference)', () => {
    const fallback = { items: [1, 2, 3] };
    const result1 = loadJSON('/nonexistent.json', fallback);
    const result2 = loadJSON('/nonexistent.json', fallback);
    result1.items.push(4);
    assert.deepStrictEqual(result2.items, [1, 2, 3]); // Not affected
  });
});

describe('reflector utils — saveJSON', () => {
  it('should save JSON and create parent directories', () => {
    const dir = join(tmpdir(), `save-test-${Date.now()}`);
    const filePath = join(dir, 'nested', 'data.json');
    saveJSON(filePath, { saved: true });
    const result = loadJSON(filePath, null);
    assert.deepStrictEqual(result, { saved: true });
    rmSync(dir, { recursive: true });
  });

  it('should overwrite existing file', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'data.json');
    saveJSON(filePath, { version: 1 });
    saveJSON(filePath, { version: 2 });
    const result = loadJSON(filePath, null);
    assert.strictEqual(result.version, 2);
    rmSync(dir, { recursive: true });
  });

  it('should return the saved data', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'data.json');
    const returned = saveJSON(filePath, { key: 'val' });
    assert.deepStrictEqual(returned, { key: 'val' });
    rmSync(dir, { recursive: true });
  });
});

describe('reflector utils — trimArray', () => {
  it('should trim array to max length', () => {
    const arr = [1, 2, 3, 4, 5];
    trimArray(arr, 3);
    assert.deepStrictEqual(arr, [3, 4, 5]);
  });

  it('should not modify array if under max', () => {
    const arr = [1, 2];
    trimArray(arr, 5);
    assert.deepStrictEqual(arr, [1, 2]);
  });

  it('should handle empty array', () => {
    const arr = [];
    trimArray(arr, 3);
    assert.deepStrictEqual(arr, []);
  });

  it('should return the trimmed array', () => {
    const arr = [1, 2, 3];
    const result = trimArray(arr, 2);
    assert.strictEqual(result, arr);
    assert.deepStrictEqual(result, [2, 3]);
  });
});

describe('reflector utils — exports', () => {
  it('should export all utils from index', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorEnsureDir, 'function');
    assert.strictEqual(typeof index.reflectorLoadJSON, 'function');
    assert.strictEqual(typeof index.reflectorSaveJSON, 'function');
    assert.strictEqual(typeof index.reflectorTrimArray, 'function');
  });

  it('should export extractFunctionBody from multi via index', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorExtractFunctionBody, 'function');
  });
});
