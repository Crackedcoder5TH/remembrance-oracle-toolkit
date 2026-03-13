/**
 * Tests for app/lib/password.ts — hashPassword, verifyPassword.
 *
 * Re-implements the password hashing logic for standalone testing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

// --- Re-implement password logic (matching app/lib/password.ts) ---

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return resolve(false);
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      const storedBuffer = Buffer.from(hash, "hex");
      resolve(timingSafeEqual(storedBuffer, derivedKey));
    });
  });
}

// --- Tests ---

describe("hashPassword", () => {
  it("returns salt:hash format", async () => {
    const result = await hashPassword("my-password");
    const parts = result.split(":");
    assert.equal(parts.length, 2);
    assert.equal(parts[0].length, 64); // 32 bytes hex = 64 chars
    assert.equal(parts[1].length, 128); // 64 bytes hex = 128 chars
  });

  it("generates unique salts each time", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    assert.notEqual(h1, h2); // Different salts → different hashes
  });

  it("produces hex-only output", async () => {
    const result = await hashPassword("test");
    assert.match(result, /^[0-9a-f]+:[0-9a-f]+$/);
  });
});

describe("verifyPassword", () => {
  it("verifies correct password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    assert.equal(result, true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    assert.equal(result, false);
  });

  it("rejects empty password against valid hash", async () => {
    const hash = await hashPassword("real-password");
    const result = await verifyPassword("", hash);
    assert.equal(result, false);
  });

  it("returns false for malformed stored hash", async () => {
    assert.equal(await verifyPassword("test", "no-colon"), false);
    assert.equal(await verifyPassword("test", ""), false);
  });

  it("handles special characters in password", async () => {
    const password = "p@$$w0rd!#%^&*()_+{}|:<>?";
    const hash = await hashPassword(password);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });

  it("handles unicode passwords", async () => {
    const password = "пароль日本語密码";
    const hash = await hashPassword(password);
    assert.equal(await verifyPassword(password, hash), true);
  });

  it("handles very long passwords", async () => {
    const password = "a".repeat(10000);
    const hash = await hashPassword(password);
    assert.equal(await verifyPassword(password, hash), true);
  });
});
