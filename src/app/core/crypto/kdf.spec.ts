import { describe, expect, it } from 'vitest';
import { deriveKeyFromPassword } from './kdf';

describe('kdf', () => {
  it('derives an extractable AES-256 key (required for recovery backup)', async () => {
    const salt = new Uint8Array(16).fill(7);
    const key = await deriveKeyFromPassword('test-master-password', salt, 1000);
    const raw = await crypto.subtle.exportKey('raw', key);
    expect(raw.byteLength).toBe(32);
  });
});
