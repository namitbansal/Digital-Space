import { Injectable, Injector, inject, signal } from '@angular/core';
import { openVaultWithKey, readVaultRevision, readVaultUpdatedAt } from '../crypto/vault-crypto';
import { GoogleAccountService } from '../auth/google-account.service';
import { EncryptedAttachmentRecord, VaultSyncAccount } from '../models/vault.models';
import { SessionService } from '../services/session.service';
import { SettingsService } from '../storage/settings.service';
import { DbService } from '../storage/db.service';
import { VaultStoreService } from '../storage/vault-store.service';
import { nowIso } from '../utils/id';
import { VaultService } from '../services/vault.service';
import { DriveApiService } from './drive-api.service';

export type SyncStatusKind = 'idle' | 'syncing' | 'ok' | 'error' | 'conflict' | 'offline';

export interface SyncStatus {
  status: SyncStatusKind;
  message: string;
  lastSyncedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly drive = inject(DriveApiService);
  private readonly store = inject(VaultStoreService);
  private readonly db = inject(DbService);
  private readonly settings = inject(SettingsService);
  private readonly session = inject(SessionService);
  private readonly google = inject(GoogleAccountService);
  private readonly injector = inject(Injector);

  private vaultService(): VaultService {
    return this.injector.get(VaultService);
  }

  readonly syncState = signal<SyncStatus>({
    status: 'idle',
    message: 'Local storage — works offline',
    lastSyncedAt: null,
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineListener: (() => void) | null = null;

  init(): void {
    if (typeof window === 'undefined' || this.onlineListener) return;
    this.onlineListener = () => {
      if (navigator.onLine) void this.scheduleAutoSync();
      else this.setState({ status: 'offline', message: 'Offline — changes saved on this device' });
    };
    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.onlineListener);
    this.refreshStatusMessage();
  }

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  shouldSync(sync?: VaultSyncAccount | null): boolean {
    const s = sync ?? this.session.vault?.sync;
    if (!s) return false;
    return s.storageMode === 'hybrid' || s.storageMode === 'drive';
  }

  private driveScope(): string | undefined {
    return this.session.vault?.meta.username?.trim().toLowerCase() || undefined;
  }

  private async vaultLayout(clientId: string): Promise<import('./drive-api.service').DriveLayout> {
    return this.drive.ensureDriveLayout(clientId, this.driveScope());
  }

  private async vaultRootId(clientId: string): Promise<string> {
    return this.drive.resolveVaultRootId(clientId, this.driveScope());
  }

  scheduleAutoSync(): void {
    if (!this.shouldSync() || !this.isOnline()) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.pushSync(true), 1500);
  }

  /**
   * On login: compare local vs Google Drive by updatedAt timestamp (revision as tiebreaker).
   * Newer copy wins and is copied to the other side — works offline-first on phone.
   */
  async mergeOnLogin(): Promise<void> {
    const sync = this.session.vault?.sync;
    if (!this.shouldSync(sync) || !this.isOnline()) {
      this.refreshStatusMessage();
      return;
    }
    const key = this.session.key;
    const localVault = this.session.vault;
    const localEnvelope = this.session.envelope;
    if (!key || !localVault || !localEnvelope) return;

    const clientId = sync?.googleClientId?.trim();
    if (!clientId || !sync?.googleAccountEmail) return;

    this.setState({ status: 'syncing', message: 'Checking Google Drive for updates…', lastSyncedAt: sync.lastSyncedAt ?? null });
    try {
      await this.google.ensureAccessToken(clientId);
      const vaultRootId = await this.vaultRootId(clientId);
      const layout = await this.drive.layoutForRoot(clientId, vaultRootId);
      const remoteEnvelope = await this.drive.downloadVaultEnc(clientId, vaultRootId);

      if (!remoteEnvelope) {
        await this.pushSync(true);
        return;
      }

      const localUpdatedAt = localVault.meta.updatedAt || '';
      const localRevision = localVault.meta.revision ?? 0;
      const remoteUpdatedAt = await readVaultUpdatedAt(key, remoteEnvelope);
      const remoteRevision = await readVaultRevision(key, remoteEnvelope);
      const remoteWins = this.remoteIsNewer(localUpdatedAt, localRevision, remoteUpdatedAt, remoteRevision);

      if (remoteWins) {
        const { vault: remoteVault } = await openVaultWithKey(remoteEnvelope, key);
        this.session.setSession({ key, vault: remoteVault, envelope: remoteEnvelope });
        await this.store.saveEnvelope(remoteEnvelope);
        await this.pullAttachments(clientId, layout.attachmentsId);
        const syncedAt = nowIso();
        await this.vaultService().updateSyncAccount({ driveFolderId: vaultRootId, lastSyncedAt: syncedAt }, { skipAudit: true });
        this.setState({
          status: 'ok',
          message: 'Synced from Google Drive (newer backup loaded)',
          lastSyncedAt: syncedAt,
        });
        return;
      }

      await this.pushSync(true);
      await this.pullAttachments(clientId, layout.attachmentsId);
    } catch {
      this.setState({ status: 'error', message: 'Sync on login failed — using data on this device' });
    }
  }

  private remoteIsNewer(
    localUpdatedAt: string,
    localRevision: number,
    remoteUpdatedAt: string,
    remoteRevision: number,
  ): boolean {
    const localTs = Date.parse(localUpdatedAt) || 0;
    const remoteTs = Date.parse(remoteUpdatedAt) || 0;
    if (remoteTs !== localTs) return remoteTs > localTs;
    return remoteRevision > localRevision;
  }

  refreshStatusMessage(): void {
    const sync = this.session.vault?.sync;
    if (!sync || sync.storageMode === 'device') {
      this.setState({ status: 'idle', message: 'Phone only — all data stays on this device', lastSyncedAt: null });
      return;
    }
    if (!this.isOnline()) {
      this.setState({
        status: 'offline',
        message: 'Offline — saved locally. Will sync when online.',
        lastSyncedAt: sync.lastSyncedAt ?? null,
      });
      return;
    }
    this.setState({
      status: 'idle',
      message: sync.lastSyncedAt ? `Last synced ${this.formatWhen(sync.lastSyncedAt)}` : 'Ready to sync',
      lastSyncedAt: sync.lastSyncedAt ?? null,
    });
  }

  /** Upload encrypted vault to Google Drive (never plaintext). */
  async pushSync(autoMerge = false): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
    const sync = this.session.vault?.sync;
    if (!this.shouldSync(sync)) {
      this.setState({ status: 'idle', message: 'Phone only — Google sync is off' });
      return { ok: true, skipped: true };
    }
    if (!this.isOnline()) {
      this.setState({ status: 'offline', message: 'Offline — changes saved on this device' });
      return { ok: false, reason: 'OFFLINE' };
    }
    const key = this.session.key;
    if (!key) {
      return { ok: false, reason: 'LOCKED' };
    }
    const clientId = sync?.googleClientId?.trim();
    if (!clientId || !sync?.googleAccountEmail) {
      this.setState({ status: 'error', message: 'Connect Google account to enable sync' });
      return { ok: false, reason: 'NO_GOOGLE' };
    }

    this.setState({ status: 'syncing', message: 'Uploading encrypted backup…', lastSyncedAt: sync.lastSyncedAt ?? null });
    try {
      await this.google.ensureAccessToken(clientId);
      const layout = await this.vaultLayout(clientId);
      const envelope = await this.store.loadEnvelope();
      if (!envelope) throw new Error('No local vault');

      const remoteEnvelope = await this.drive.downloadVaultEnc(clientId, layout.rootId);
      const localUpdatedAt = this.session.vault?.meta.updatedAt ?? '';
      const localRevision = this.session.vault?.meta.revision ?? (await this.settings.load()).vaultRevision ?? 0;
      let remoteUpdatedAt = '';
      let remoteRevision = 0;
      if (remoteEnvelope) {
        remoteUpdatedAt = await readVaultUpdatedAt(key, remoteEnvelope);
        remoteRevision = await readVaultRevision(key, remoteEnvelope);
      }

      if (
        remoteEnvelope &&
        !autoMerge &&
        this.remoteIsNewer(localUpdatedAt, localRevision, remoteUpdatedAt, remoteRevision)
      ) {
        await this.drive.backupEnvelope(clientId, layout.backupsId, envelope, `local-${Date.now()}`);
        this.setState({
          status: 'conflict',
          message: 'Google Drive has a newer vault. Pull to download, or push again to overwrite.',
          lastSyncedAt: sync.lastSyncedAt ?? null,
        });
        await this.vaultService().updateSyncAccount({ driveFolderId: layout.rootId }, { skipAudit: true });
        return { ok: false, reason: 'CONFLICT' };
      }

      await this.drive.uploadVaultEnc(clientId, layout.rootId, envelope);
      await this.pushAttachments(clientId, layout.attachmentsId);
      await this.vaultService().uploadRecoveryIfPossible();
      const syncedAt = nowIso();
      await this.vaultService().recordAudit({
        action: 'sync.push',
        summary: 'Backed up to Google Drive',
        meta: { at: syncedAt },
      });
      await this.vaultService().updateSyncAccount({ driveFolderId: layout.rootId, lastSyncedAt: syncedAt }, { skipAudit: true });
      this.setState({ status: 'ok', message: 'Synced to Google Drive (fully encrypted)', lastSyncedAt: syncedAt });
      return { ok: true };
    } catch {
      this.setState({ status: 'error', message: 'Sync failed — your data is still safe on this device' });
      return { ok: false, reason: 'ERROR' };
    }
  }

  /** Download encrypted vault from Google Drive into local storage. Re-unlock required. */
  async pullSync(force = false): Promise<{ ok: boolean; imported?: boolean; skipped?: boolean; reason?: string }> {
    const sync = this.session.vault?.sync;
    if (!this.shouldSync(sync)) return { ok: true, skipped: true };
    if (!this.isOnline()) {
      this.setState({ status: 'offline', message: 'Offline — cannot download from Google Drive' });
      return { ok: false, reason: 'OFFLINE' };
    }
    const key = this.session.key;
    if (!key) {
      return { ok: false, reason: 'LOCKED' };
    }
    const clientId = sync?.googleClientId?.trim();
    if (!clientId || !sync?.googleAccountEmail) {
      return { ok: false, reason: 'NO_GOOGLE' };
    }

    this.setState({ status: 'syncing', message: 'Downloading encrypted vault…', lastSyncedAt: sync.lastSyncedAt ?? null });
    try {
      await this.google.ensureAccessToken(clientId);
      const vaultRootId = await this.vaultRootId(clientId);
      const layout = await this.drive.layoutForRoot(clientId, vaultRootId);
      const remote = await this.drive.downloadVaultEnc(clientId, vaultRootId);
      if (!remote) {
        this.setState({ status: 'ok', message: 'No backup on Google Drive yet' });
        return { ok: true };
      }

      const local = await this.store.loadEnvelope();
      const localRev = this.session.vault?.meta.revision ?? (await this.settings.load()).vaultRevision ?? 0;
      const remoteRev = await readVaultRevision(key, remote);

      if (local && localRev > remoteRev && !force) {
        await this.drive.backupEnvelope(clientId, layout.backupsId, remote, `remote-${Date.now()}`);
        this.setState({
          status: 'conflict',
          message: 'This device has newer data. Push to upload, or force pull to replace local.',
        });
        return { ok: false, reason: 'CONFLICT' };
      }

      if (local && force) {
        await this.drive.backupEnvelope(clientId, layout.backupsId, local, `pre-pull-${Date.now()}`);
      }

      await this.store.saveEnvelope(remote);
      await this.pullAttachments(clientId, layout.attachmentsId);
      const syncedAt = nowIso();
      await this.settings.save({ vaultRevision: remoteRev || (await this.settings.load()).vaultRevision });
      await this.vaultService().recordAudit({
        action: 'sync.pull',
        summary: force ? 'Downloaded from Google Drive (forced)' : 'Downloaded from Google Drive',
        meta: { at: syncedAt },
      });
      await this.vaultService().updateSyncAccount({ driveFolderId: vaultRootId, lastSyncedAt: syncedAt }, { skipAudit: true });
      this.setState({ status: 'ok', message: 'Downloaded — lock and unlock to load', lastSyncedAt: syncedAt });
      return { ok: true, imported: true };
    } catch {
      this.setState({ status: 'error', message: 'Download failed' });
      return { ok: false, reason: 'ERROR' };
    }
  }

  private async pushAttachments(clientId: string, folderId: string): Promise<void> {
    const records = await this.db.attachmentListAll();
    for (const record of records) {
      if (record?.id && record.iv && record.ciphertext) {
        await this.drive.uploadAttachmentEnc(clientId, folderId, record);
      }
    }
  }

  private async pullAttachments(clientId: string, folderId: string): Promise<void> {
    const ids = await this.drive.listAttachmentIds(clientId, folderId);
    for (const id of ids) {
      const record = await this.drive.downloadAttachmentEnc(clientId, folderId, id);
      if (record?.id && record.iv && record.ciphertext) {
        await this.db.attachmentPut(record);
      }
    }
  }

  private setState(partial: Partial<SyncStatus>): void {
    this.syncState.update((s) => ({ ...s, ...partial }));
  }

  private formatWhen(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
}
