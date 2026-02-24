// Form validation — real-time feedback with touched state tracking
// Green/red borders, helper text, aria-invalid support

interface ValidationState {
  value: string;
  touched: boolean;
  minLength: number;
}

interface ValidationResult {
  valid: boolean;
  error: string;
  fieldClass: string;
}

function validateField({ value, touched, minLength }: ValidationState): ValidationResult {
  const trimmed = value.trim();
  const valid = trimmed.length >= minLength;

  if (!touched) {
    return { valid: false, error: "", fieldClass: "border-teal-cathedral/20" };
  }

  if (valid) {
    return { valid: true, error: "", fieldClass: "field-valid" };
  }

  const error = trimmed.length === 0
    ? "This field is required"
    : `At least ${minLength} characters needed`;

  return { valid: false, error, fieldClass: "field-invalid" };
}

export { validateField };
export type { ValidationState, ValidationResult };
