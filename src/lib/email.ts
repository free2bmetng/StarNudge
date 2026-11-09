/** Lowercases and validates an email address. Returns null when it is not usable. */
export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}
