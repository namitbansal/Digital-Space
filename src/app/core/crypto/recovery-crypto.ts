import { VaultCodeRecoveryRecord, VaultEmailRecoveryRecord, VaultRecoveryRecord } from '../models/vault.models';
import { encryptString, decryptString } from './aes';
import { base64ToBytes } from './encoding';
import { createKdfParams, deriveKeyFromPassword } from './kdf';
import { exportAesKeyRaw, importAesKeyRaw } from './key-export';

const RECOVERY_CONTEXT = 'personal-vault-google-recovery-v1';

/** Key derived from the linked Google account — only that account can read recovery.enc on Drive. */
async function deriveGoogleRecoveryKey(googleAccountId: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKeyFromPassword(`${RECOVERY_CONTEXT}:${googleAccountId}`, salt);
}

export async function sealRecoveryRecord(vaultKey: CryptoKey, googleAccountId: string): Promise<VaultRecoveryRecord> {
  const kdf = createKdfParams();
  const recoveryKey = await deriveGoogleRecoveryKey(googleAccountId, kdf.saltBytes);
  const keyMaterial = await exportAesKeyRaw(vaultKey);
  const { iv, ciphertext } = await encryptString(recoveryKey, keyMaterial);
  return {
    version: 1,
    googleAccountId,
    createdAt: new Date().toISOString(),
    kdf: {
      algo: kdf.algo,
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    cipher: { algo: 'AES-GCM', iv, ciphertext },
  };
}

export async function openRecoveryRecord(record: VaultRecoveryRecord, googleAccountId: string): Promise<CryptoKey> {
  if (record.googleAccountId !== googleAccountId) {
    const err = new Error('RECOVERY_ACCOUNT_MISMATCH') as Error & { code?: string };
    err.code = 'RECOVERY_ACCOUNT_MISMATCH';
    throw err;
  }
  const saltBytes = base64ToBytes(record.kdf.salt);
  const recoveryKey = await deriveGoogleRecoveryKey(googleAccountId, saltBytes);
  const keyMaterial = await decryptString(recoveryKey, record.cipher.iv, record.cipher.ciphertext);
  return importAesKeyRaw(keyMaterial);
}

const CODE_RECOVERY_CONTEXT = 'personal-vault-code-recovery-v1';

async function deriveCodeRecoveryKey(recoveryCode: string, salt: Uint8Array): Promise<CryptoKey> {
  const normalized = recoveryCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return deriveKeyFromPassword(`${CODE_RECOVERY_CONTEXT}:${normalized}`, salt);
}

export async function sealCodeRecoveryRecord(vaultKey: CryptoKey, recoveryCode: string): Promise<VaultCodeRecoveryRecord> {
  const kdf = createKdfParams();
  const recoveryKey = await deriveCodeRecoveryKey(recoveryCode, kdf.saltBytes);
  const keyMaterial = await exportAesKeyRaw(vaultKey);
  const { iv, ciphertext } = await encryptString(recoveryKey, keyMaterial);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: {
      algo: kdf.algo,
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    cipher: { algo: 'AES-GCM', iv, ciphertext },
  };
}

export async function openCodeRecoveryRecord(record: VaultCodeRecoveryRecord, recoveryCode: string): Promise<CryptoKey> {
  const saltBytes = base64ToBytes(record.kdf.salt);
  const recoveryKey = await deriveCodeRecoveryKey(recoveryCode, saltBytes);
  try {
    const keyMaterial = await decryptString(recoveryKey, record.cipher.iv, record.cipher.ciphertext);
    return importAesKeyRaw(keyMaterial);
  } catch {
    const err = new Error('INVALID_RECOVERY_CODE') as Error & { code?: string };
    err.code = 'INVALID_RECOVERY_CODE';
    throw err;
  }
}

const EMAIL_RECOVERY_CONTEXT = 'personal-vault-email-recovery-v1';

function normalizeRecoveryEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function deriveEmailRecoveryKey(email: string, salt: Uint8Array): Promise<CryptoKey> {
  const normalized = normalizeRecoveryEmail(email);
  return deriveKeyFromPassword(`${EMAIL_RECOVERY_CONTEXT}:${normalized}`, salt);
}

export async function sealEmailRecoveryRecord(vaultKey: CryptoKey, email: string): Promise<VaultEmailRecoveryRecord> {
  const normalized = normalizeRecoveryEmail(email);
  const kdf = createKdfParams();
  const recoveryKey = await deriveEmailRecoveryKey(normalized, kdf.saltBytes);
  const keyMaterial = await exportAesKeyRaw(vaultKey);
  const { iv, ciphertext } = await encryptString(recoveryKey, keyMaterial);
  return {
    version: 1,
    email: normalized,
    createdAt: new Date().toISOString(),
    kdf: {
      algo: kdf.algo,
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: kdf.salt,
    },
    cipher: { algo: 'AES-GCM', iv, ciphertext },
  };
}

export async function openEmailRecoveryRecord(record: VaultEmailRecoveryRecord, email: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryEmail(email);
  if (normalizeRecoveryEmail(record.email) !== normalized) {
    const err = new Error('EMAIL_MISMATCH') as Error & { code?: string };
    err.code = 'EMAIL_MISMATCH';
    throw err;
  }
  const saltBytes = base64ToBytes(record.kdf.salt);
  const recoveryKey = await deriveEmailRecoveryKey(normalized, saltBytes);
  try {
    const keyMaterial = await decryptString(recoveryKey, record.cipher.iv, record.cipher.ciphertext);
    return importAesKeyRaw(keyMaterial);
  } catch {
    const err = new Error('EMAIL_RECOVERY_FAILED') as Error & { code?: string };
    err.code = 'EMAIL_RECOVERY_FAILED';
    throw err;
  }
}
