import { randomBytes } from './random';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly recovery code: XXXX-XXXX-XXXX-XXXX */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(16);
  let raw = '';
  for (let i = 0; i < 16; i += 1) {
    raw += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatRecoveryCode(normalized: string): string {
  const clean = normalizeRecoveryCode(normalized);
  if (clean.length !== 16) return normalized.trim().toUpperCase();
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}`;
}
