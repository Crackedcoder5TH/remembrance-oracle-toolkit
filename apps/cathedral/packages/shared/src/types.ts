/** A coherence request from the cathedral UI. */
export interface CoherenceRequest {
  input: string;
  rating: number;
}

/** The oracle's response — a coherence score, whisper, and on-chain anchor. */
export interface CoherenceResponse {
  coherence: number;
  whisper: string;
  rating: number;
  inputHash: string;
  solanaSlot: number | null;
  timestamp: number;
}

/** A whisper entry stored in local history. */
export interface WhisperEntry {
  id: string;
  input: string;
  coherence: number;
  whisper: string;
  rating: number;
  inputHash: string;
  solanaSlot: number | null;
  timestamp: number;
}

/** Solana coherence log entry — for future on-chain logging. */
export interface CoherenceLogEntry {
  timestamp: number;
  coherence: number;
  inputHash: string;
  wallet?: string;
  txSignature?: string;
}
