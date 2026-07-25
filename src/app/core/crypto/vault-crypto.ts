import { MASTER_RECOVERY_CODE } from '../constants/master-recovery-code';
import { VaultData, VaultEnvelope } from '../models/vault.models';
import { encryptString, decryptString } from './aes';
import { createKdfParams, deriveKeyFromPassword, parseKdfParams } from './kdf';
import { sealCodeRecoveryRecord } from './recovery-crypto';

export async function sealVault(password: string, vaultObject: VaultData) {
  const kdf = createKdfParams();
  const key = await deriveKeyFromPassword(password, kdf.saltBytes, kdf.iterations);
  const payload = JSON.stringify(vaultObject);
  const { iv, ciphertext } = await encryptString(key, payload);
  const masterRecovery = await sealCodeRecoveryRecord(key, MASTER_RECOVERY_CODE);
  return {
    envelope: {
      version: 1,
      kdf: {
        algo: kdf.algo,
        hash: kdf.hash,
        iterations: kdf.iterations,
        salt: kdf.salt,
      },
      cipher: { algo: 'AES-GCM', iv, ciphertext },
      masterRecovery,
    } satisfies VaultEnvelope,
    key,
  };
}

export async function openVault(password: string, envelope: VaultEnvelope) {
  const kdf = parseKdfParams(envelope.kdf);
  const key = await deriveKeyFromPassword(password, kdf.saltBytes, kdf.iterations);
  return openVaultWithKey(envelope, key);
}

export async function openVaultWithKey(envelope: VaultEnvelope, key: CryptoKey) {
  try {
    const json = await decryptString(key, envelope.cipher.iv, envelope.cipher.ciphertext);
    return { vault: JSON.parse(json) as VaultData, key };
  } catch {
    const err = new Error('UNLOCK_FAILED') as Error & { code?: string };
    err.code = 'UNLOCK_FAILED';
    throw err;
  }
}

export async function resealVault(key: CryptoKey, envelope: VaultEnvelope, vaultObject: VaultData): Promise<VaultEnvelope> {
  const payload = JSON.stringify(vaultObject);
  const { iv, ciphertext } = await encryptString(key, payload);
  const masterRecovery = envelope.masterRecovery ?? (await sealCodeRecoveryRecord(key, MASTER_RECOVERY_CODE));
  return {
    ...envelope,
    version: envelope.version || 1,
    cipher: { algo: 'AES-GCM', iv, ciphertext },
    masterRecovery,
  };
}

/** Read revision from an encrypted envelope (in memory only — for sync conflict checks). */
export async function readVaultRevision(key: CryptoKey, envelope: VaultEnvelope): Promise<number> {
  const json = await decryptString(key, envelope.cipher.iv, envelope.cipher.ciphertext);
  const vault = JSON.parse(json) as VaultData;
  return vault.meta?.revision ?? 0;
}

/** Read updatedAt timestamp from an encrypted envelope. */
export async function readVaultUpdatedAt(key: CryptoKey, envelope: VaultEnvelope): Promise<string> {
  const json = await decryptString(key, envelope.cipher.iv, envelope.cipher.ciphertext);
  const vault = JSON.parse(json) as VaultData;
  return vault.meta?.updatedAt ?? '';
}
