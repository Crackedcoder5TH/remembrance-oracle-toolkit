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
