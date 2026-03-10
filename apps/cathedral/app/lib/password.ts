/**
 * Password hashing using Node.js built-in crypto (scrypt).
 * No external dependencies needed.
 */

import { scrypt, randomBytes, timingSafeEqual } from "crypto";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

/** Hash a password. Returns "salt:hash" in hex. */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/** Verify a password against a stored hash. */
export function verifyPassword(password: string, stored: string): Promise<boolean> {
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
