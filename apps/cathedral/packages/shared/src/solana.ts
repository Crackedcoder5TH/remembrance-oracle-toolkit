import { Connection, clusterApiUrl } from "@solana/web3.js";

const TESTNET_URL = clusterApiUrl("testnet");

let connectionInstance: Connection | null = null;

/** Get a singleton Solana testnet connection. */
export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = new Connection(TESTNET_URL, "confirmed");
  }
  return connectionInstance;
}

/** Hash a string to a hex digest using Web Crypto (works in Edge Runtime + Node). */
export async function hashInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
