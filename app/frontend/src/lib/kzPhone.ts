/** Convert local or pasted +7/8 input to the canonical phone prefix. */
export function kzNationalDigits(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (value.trim().startsWith('+7')) return digits.slice(1);
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return digits.slice(1);
  return digits;
}
export function isCompleteKzPhone(value: string): boolean {
  return kzNationalDigits(value).length === 10;
}
