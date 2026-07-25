import { base64ToBytes, bytesToBase64 } from './encoding';
import { randomBytes } from './random';

export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

export async function deriveKeyFromPassword(
  password: string,
  saltBytes: Uint8Array,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export function createKdfParams(iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = randomBytes(16);
  return {
    algo: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    saltBytes: salt,
  };
}

export function parseKdfParams(kdf: { salt: string; iterations: number; algo: string; hash: string }) {
  return {
    ...kdf,
    saltBytes: base64ToBytes(kdf.salt),
  };
}
