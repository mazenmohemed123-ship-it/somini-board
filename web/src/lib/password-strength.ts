export type PasswordStrength = "weak" | "good" | "very-good";

export function checkPasswordStrength(password: string): PasswordStrength {
  if (!password) return "weak";

  let score = 0;

  // Length checks
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Character type checks
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  // Determine strength
  if (score >= 6) return "very-good";
  if (score >= 4) return "good";
  return "weak";
}

export const strengthLabels = {
  ar: {
    weak: "ضعيفة",
    good: "جيدة",
    "very-good": "جيدة جداً",
  },
  en: {
    weak: "Weak",
    good: "Good",
    "very-good": "Very good",
  },
} as const;

export const strengthColors = {
  weak: "#dc2626",      // red-600
  good: "#f59e0b",      // amber-500
  "very-good": "#10b981", // emerald-500
} as const;
