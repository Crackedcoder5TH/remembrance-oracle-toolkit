/** A coherence request from the cathedral UI. */
export interface CoherenceRequest {
  input: string;
  rating: number;
}

/** The oracle's response — a coherence score and a whisper. */
export interface CoherenceResponse {
  coherence: number;
  whisper: string;
  rating: number;
}

/** Solana coherence log entry — for future on-chain logging. */
export interface CoherenceLogEntry {
  timestamp: number;
  coherence: number;
  inputHash: string;
  wallet?: string;
  txSignature?: string;
}
