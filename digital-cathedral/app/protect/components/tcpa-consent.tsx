/**
 * TcpaConsent — TCPA-compliant consent checkboxes.
 * Oracle: GENERATE (0.371) — no existing pattern, write new
 *
 * FCC 2025 one-to-one consent rule compliant:
 *  - Single identified company per checkbox
 *  - Unchecked by default
 *  - Clear disclosure adjacent to checkbox
 *  - Not a condition of purchase
 *  - Links to Privacy Policy and Terms of Service
 */

interface TcpaConsentProps {
  tcpaChecked: boolean;
  privacyChecked: boolean;
  onTcpaChange: (checked: boolean) => void;
  onPrivacyChange: (checked: boolean) => void;
  tcpaError?: string;
  privacyError?: string;
}

export function TcpaConsent({
  tcpaChecked,
  privacyChecked,
  onTcpaChange,
  onPrivacyChange,
  tcpaError,
  privacyError,
}: TcpaConsentProps) {
  return (
    <>
      {/* TCPA Consent — FCC 2025 One-to-One Compliance */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input
            id="tcpaConsent"
            type="checkbox"
            checked={tcpaChecked}
            onChange={(e) => onTcpaChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-navy-cathedral/25 bg-soft-gray text-emerald-accent focus:ring-emerald-accent/50 shrink-0"
          />
          <label htmlFor="tcpaConsent" className="text-xs text-[var(--text-muted)] leading-relaxed">
            By checking this box, I agree that <strong className="text-[var(--text-primary)]">Digital Cathedral</strong> may
            contact me at the phone number I provided above, including by autodialed or prerecorded calls
            and text messages, for marketing purposes. I understand this consent is <strong className="text-[var(--text-primary)]">not
            required</strong> to obtain any product or service. Message and data rates may apply. I have read
            and agree to the{" "}
            <a href="/privacy" className="text-emerald-accent underline">Privacy Policy</a> and{" "}
            <a href="/terms" className="text-emerald-accent underline">Terms of Service</a>.
          </label>
        </div>
        {tcpaError && <p className="text-calm-error text-xs ml-7">{tcpaError}</p>}
      </div>

      {/* Privacy / Terms Consent */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input
            id="privacyConsent"
            type="checkbox"
            checked={privacyChecked}
            onChange={(e) => onPrivacyChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-navy-cathedral/25 bg-soft-gray text-emerald-accent focus:ring-emerald-accent/50 shrink-0"
          />
          <label htmlFor="privacyConsent" className="text-xs text-[var(--text-muted)] leading-relaxed">
            I acknowledge that my information will be shared with licensed insurance professionals
            who may contact me about life insurance options. I understand I can opt out at any time.
            See our <a href="/privacy" className="text-emerald-accent underline">Privacy Policy</a> for
            details on how we handle your data, including your right to opt out of the sale
            or sharing of your personal information.
          </label>
        </div>
        {privacyError && <p className="text-calm-error text-xs ml-7">{privacyError}</p>}
      </div>
    </>
  );
}
