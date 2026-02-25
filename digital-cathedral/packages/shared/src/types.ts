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

/** Lead submission from the insurance protection form. */
export interface LeadSubmission {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  tcpaConsent: boolean;
  privacyConsent: boolean;
  consentTimestamp: string;
  consentText: string;
}

/** API response after lead submission. */
export interface LeadResponse {
  success: boolean;
  message: string;
  leadId?: string;
  whisper?: string;
}
