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
  confirmationMessage?: string;
}
