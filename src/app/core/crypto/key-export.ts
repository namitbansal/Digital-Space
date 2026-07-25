import { base64ToBytes, bytesToBase64 } from './encoding';

export async function exportAesKeyRaw(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importAesKeyRaw(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(b64) as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
