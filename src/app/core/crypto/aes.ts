import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding';
import { randomBytes } from './random';

export async function encryptString(key: CryptoKey, plaintext: string) {
  const iv = randomBytes(12);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    utf8ToBytes(plaintext) as BufferSource,
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

export async function decryptString(key: CryptoKey, ivB64: string, ciphertextB64: string) {
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(ciphertextB64);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return bytesToUtf8(new Uint8Array(plainBuf));
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array) {
  const iv = randomBytes(12);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    bytes as BufferSource,
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}
