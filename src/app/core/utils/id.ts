import { randomId } from '../crypto/random';

export function createId(prefix: string): string {
  return randomId(prefix);
}

export function nowIso(): string {
  return new Date().toISOString();
}
