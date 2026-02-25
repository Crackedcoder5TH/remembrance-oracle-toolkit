/**
 * Reflector — Shared Utilities
 *
 * Common helpers: ensureDir, loadJSON, saveJSON, trimArray.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');

function ensureDir(dir) {
  if (!dir) return;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadJSON(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Fall through to fallback
  }
  return fallback !== null ? structuredClone(fallback) : null;
}

function saveJSON(filePath, data) {
  if (!filePath) return data;
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

function trimArray(arr, maxLength) {
  if (!arr) return [];
  while (arr.length > maxLength) arr.shift();
  return arr;
}

function deepMerge(target, source) {
  if (!target && !source) return {};
  if (!target) return deepClone(source);
  if (!source) return deepClone(target);
  const result = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
        key in result && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = deepClone(v);
  }
  return result;
}

function setNestedValue(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

module.exports = {
  ensureDir,
  loadJSON,
  saveJSON,
  trimArray,
  deepMerge,
  deepClone,
  setNestedValue,
  getNestedValue,
};
