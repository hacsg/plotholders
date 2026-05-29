/**
 * Phone number normalization helper for SG market (Qashier + customer lookups)
 * Matches the spec in Phase 2 requirements.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';

  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // If starts with 65 and exactly 10 chars (e.g. 6581234567? wait spec says length 10 after 65? 65 + 8 digits = 10 chars)
  // SG numbers: +65 followed by 8 digits. So '65' + 8 digits = 10 chars total.
  if (cleaned.startsWith('65') && cleaned.length === 10) {
    cleaned = '+' + cleaned;
  } else if (cleaned.length === 8 && /^\d+$/.test(cleaned)) {
    // Pure 8-digit SG number
    cleaned = '+65' + cleaned;
  } else if (cleaned.startsWith('+65') && cleaned.length === 11) {
    // Already good
  } else if (cleaned.startsWith('65') && cleaned.length === 11) {
    // 65 + 9? rare, normalize
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // SG mobile: +65 followed by 8 digits starting with 8 or 9 typically
  return /^\+65[89]\d{7}$/.test(normalized);
}
