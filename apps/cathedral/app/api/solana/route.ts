import { NextResponse } from "next/server";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const TESTNET_URL = clusterApiUrl("testnet");

export async function GET() {
  try {
    const connection = new Connection(TESTNET_URL, "confirmed");
    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot).catch(() => null);

    return NextResponse.json({
      connected: true,
      network: "testnet",
      slot,
      blockTime,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({
      connected: false,
      network: "testnet",
      slot: null,
      blockTime: null,
      timestamp: Date.now(),
    });
  }
}
