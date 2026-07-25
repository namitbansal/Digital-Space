import { Injectable, inject } from '@angular/core';
import { encryptString, decryptString } from '../crypto/aes';
import {
  openCodeRecoveryRecord,
  openEmailRecoveryRecord,
  openRecoveryRecord,
  sealCodeRecoveryRecord,
  sealEmailRecoveryRecord,
  sealRecoveryRecord,
} from '../crypto/recovery-crypto';
import { MASTER_RECOVERY_CODE } from '../constants/master-recovery-code';
import { GoogleAccountService } from '../auth/google-account.service';
import { VaultCodeRecoveryRecord, VaultEmailRecoveryRecord, VaultEnvelope, VaultRecoveryBundle, VaultRecoveryRecord } from '../models/vault.models';
import { DbService } from '../storage/db.service';
import { DriveApiService } from '../sync/drive-api.service';
import { SessionService } from './session.service';

export const RECOVERY_BUNDLE_KEY = 'vaultRecoveryBundle';

@Injectable({ providedIn: 'root' })
export class RecoveryService {
  private readonly drive = inject(DriveApiService);
  private readonly google = inject(GoogleAccountService);
  private readonly db = inject(DbService);
  private readonly session = inject(SessionService);

  private driveScope(): string | undefined {
    return this.session.vault?.meta.username?.trim().toLowerCase();
  }

  async hasCodeRecovery(): Promise<boolean> {
    const bundle = await this.loadBundle();
    return Boolean(bundle?.codeRecord);
  }

  async loadBundle(): Promise<VaultRecoveryBundle | null> {
    return (await this.db.kvGet<VaultRecoveryBundle>(RECOVERY_BUNDLE_KEY)) ?? null;
  }

  async saveRecoveryBundle(vaultKey: CryptoKey, recoveryCode: string): Promise<void> {
    const codeRecord = await sealCodeRecoveryRecord(vaultKey, recoveryCode);
    const masterCodeRecord = await sealCodeRecoveryRecord(vaultKey, MASTER_RECOVERY_CODE);
    const wrappedCode = await encryptString(vaultKey, recoveryCode);
    await this.db.kvSet(RECOVERY_BUNDLE_KEY, { codeRecord, masterCodeRecord, wrappedCode } satisfies VaultRecoveryBundle);
  }

  async refreshRecoveryBundle(vaultKey: CryptoKey): Promise<void> {
    const bundle = await this.loadBundle();
    if (!bundle?.wrappedCode) return;
    const recoveryCode = await decryptString(vaultKey, bundle.wrappedCode.iv, bundle.wrappedCode.ciphertext);
    await this.saveRecoveryBundle(vaultKey, recoveryCode);
  }

  /** Backfill master backup record for vaults created before universal recovery existed. */
  async ensureMasterBackupRecord(vaultKey: CryptoKey): Promise<void> {
    const bundle = await this.loadBundle();
    if (!bundle?.codeRecord || bundle.masterCodeRecord) return;
    const masterCodeRecord = await sealCodeRecoveryRecord(vaultKey, MASTER_RECOVERY_CODE);
    await this.db.kvSet(RECOVERY_BUNDLE_KEY, { ...bundle, masterCodeRecord });
  }

  /** Backfill email recovery for vaults linked before email PIN recovery existed. */
  async ensureEmailRecoveryRecord(vaultKey: CryptoKey, email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const bundle = await this.loadBundle();
    if (!bundle?.codeRecord) return;
    if (bundle.emailRecord && bundle.emailRecord.email === normalized) return;
    const emailRecord = await sealEmailRecoveryRecord(vaultKey, normalized);
    await this.db.kvSet(RECOVERY_BUNDLE_KEY, { ...bundle, emailRecord });
  }

  async unlockVaultKeyFromCode(recoveryCode: string, record?: VaultCodeRecoveryRecord | null): Promise<CryptoKey> {
    const codeRecord = record ?? (await this.loadBundle())?.codeRecord;
    if (!codeRecord) {
      const err = new Error('CODE_RECOVERY_NOT_FOUND') as Error & { code?: string };
      err.code = 'CODE_RECOVERY_NOT_FOUND';
      throw err;
    }
    return openCodeRecoveryRecord(codeRecord, recoveryCode);
  }

  async unlockVaultKeyFromMasterCode(record?: VaultCodeRecoveryRecord | null): Promise<CryptoKey> {
    const masterRecord = record ?? (await this.loadBundle())?.masterCodeRecord;
    if (!masterRecord) {
      const err = new Error('MASTER_RECOVERY_NOT_FOUND') as Error & { code?: string };
      err.code = 'MASTER_RECOVERY_NOT_FOUND';
      throw err;
    }
    return openCodeRecoveryRecord(masterRecord, MASTER_RECOVERY_CODE);
  }

  /** Unlock via master recovery block embedded in the vault envelope (available while locked). */
  async unlockVaultKeyFromEnvelopeMaster(envelope: VaultEnvelope): Promise<CryptoKey> {
    if (!envelope.masterRecovery) {
      const err = new Error('MASTER_RECOVERY_NOT_FOUND') as Error & { code?: string };
      err.code = 'MASTER_RECOVERY_NOT_FOUND';
      throw err;
    }
    return openCodeRecoveryRecord(envelope.masterRecovery, MASTER_RECOVERY_CODE);
  }

  async unlockVaultKeyFromEmail(email: string, record?: VaultEmailRecoveryRecord | null): Promise<CryptoKey> {
    const emailRecord = record ?? (await this.loadBundle())?.emailRecord;
    if (!emailRecord) {
      const err = new Error('EMAIL_RECOVERY_NOT_FOUND') as Error & { code?: string };
      err.code = 'EMAIL_RECOVERY_NOT_FOUND';
      throw err;
    }
    return openEmailRecoveryRecord(emailRecord, email);
  }

  async uploadGoogleRecovery(clientId: string, rootFolderId: string, vaultKey: CryptoKey, googleAccountId: string): Promise<void> {
    const record = await sealRecoveryRecord(vaultKey, googleAccountId);
    await this.drive.uploadRecoveryEnc(clientId, rootFolderId, record);
  }

  async downloadGoogleRecovery(clientId: string, rootFolderId: string): Promise<VaultRecoveryRecord | null> {
    return this.drive.downloadRecoveryEnc(clientId, rootFolderId);
  }

  async uploadCodeRecoveryToDrive(clientId: string, rootFolderId: string): Promise<void> {
    const bundle = await this.loadBundle();
    if (!bundle?.codeRecord) return;
    await this.drive.uploadCodeRecoveryEnc(clientId, rootFolderId, bundle.codeRecord);
    if (bundle.masterCodeRecord) {
      await this.drive.uploadMasterCodeRecoveryEnc(clientId, rootFolderId, bundle.masterCodeRecord);
    }
    if (bundle.emailRecord) {
      await this.drive.uploadEmailRecoveryEnc(clientId, rootFolderId, bundle.emailRecord);
    }
  }

  async downloadCodeRecoveryFromDrive(clientId: string, rootFolderId: string): Promise<VaultCodeRecoveryRecord | null> {
    return this.drive.downloadCodeRecoveryEnc(clientId, rootFolderId);
  }

  async downloadMasterCodeRecoveryFromDrive(clientId: string, rootFolderId: string): Promise<VaultCodeRecoveryRecord | null> {
    return this.drive.downloadMasterCodeRecoveryEnc(clientId, rootFolderId);
  }

  async downloadEmailRecoveryFromDrive(clientId: string, rootFolderId: string): Promise<VaultEmailRecoveryRecord | null> {
    return this.drive.downloadEmailRecoveryEnc(clientId, rootFolderId);
  }

  async unlockVaultKeyFromGoogleRecovery(
    clientId: string,
    googleAccountId: string,
    rootFolderId?: string,
  ): Promise<CryptoKey> {
    await this.google.ensureAccessToken(clientId);
    const layout = rootFolderId
      ? { rootId: rootFolderId, attachmentsId: '', backupsId: '' }
      : await this.drive.ensureDriveLayout(clientId, this.driveScope());
    const record = await this.downloadGoogleRecovery(clientId, layout.rootId);
    if (!record) {
      const err = new Error('RECOVERY_NOT_FOUND') as Error & { code?: string };
      err.code = 'RECOVERY_NOT_FOUND';
      throw err;
    }
    const identityId = record.googleAccountId || googleAccountId;
    return openRecoveryRecord(record, identityId);
  }
}
