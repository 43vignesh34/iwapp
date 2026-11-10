/**
 * Normalises a phone number to E.164 ("+919876543210"), the only format the database accepts
 * (person_phone_e164_format). Pure, no I/O: a domain function (spec §10 coverage target).
 *
 * Accepts the ways people actually type Indian numbers:
 *   "98765 43210"  "098765-43210"  "+91 98765 43210"  "0091 9876543210"  "(+91) 98765.43210"
 * and any other international number written with a leading "+" or "00".
 * Returns null if it can't be read as a phone number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const international = trimmed.startsWith('+') || trimmed.startsWith('(+');
  let digits = trimmed.replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;

  if (!international && digits.startsWith('00'))
    digits = digits.slice(2); // 00 = international
  else if (!international) {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // trunk 0
    if (digits.length === 10 && /^[6-9]/.test(digits))
      digits = `91${digits}`; // Indian mobile
    else if (!(digits.length === 12 && digits.startsWith('91'))) return null;
  }

  if (digits.startsWith('91') && !/^91[6-9]\d{9}$/.test(digits)) return null; // Indian mobile
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}
