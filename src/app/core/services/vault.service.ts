import { Injectable, Injector, inject } from '@angular/core';
import { openVault, openVaultWithKey, resealVault, sealVault } from '../crypto/vault-crypto';
import { generateRecoveryCode } from '../crypto/recovery-code';
import { isMasterRecoveryCode } from '../constants/master-recovery-code';
import { APP_NAME } from '../constants/app-name';
import { emptyFieldsForType } from '../items/item-registry';
import { Folder, Profile, VaultData, VaultItem, VaultSyncAccount, AppSettings, VaultEnvelope, AuditEntry } from '../models/vault.models';
import { SettingsService } from '../storage/settings.service';
import { VaultStoreService } from '../storage/vault-store.service';
import { createId, nowIso } from '../utils/id';
import { appendAudit } from './audit.util';
import { assertSameProfile, folderIdsForProfile, profileAccessError } from './profile-access';
import { defaultProfilesAndFolders, ensureVaultShape } from './migrate';
import { SessionService } from './session.service';
import { SyncService } from '../sync/sync.service';
import { RecoveryService } from './recovery.service';
import { DriveApiService } from '../sync/drive-api.service';
import { GoogleAccountService } from '../auth/google-account.service';
import { UserContextService } from './user-context.service';
import { UserRegistryApiService } from './user-registry-api.service';
import { normalizeUsername, usernameError } from '../utils/username';
import { AppLogger } from './logger.util';

@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly store = inject(VaultStoreService);
  private readonly settings = inject(SettingsService);
  private readonly session = inject(SessionService);
  private readonly injector = inject(Injector);
  private readonly users = inject(UserContextService);
  private readonly registry = inject(UserRegistryApiService);

  private recovery(): RecoveryService {
    return this.injector.get(RecoveryService);
  }

  private drive(): DriveApiService {
    return this.injector.get(DriveApiService);
  }

  private google(): GoogleAccountService {
    return this.injector.get(GoogleAccountService);
  }

  private syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  vaultExists(): Promise<boolean> {
    return this.hasAnyVault();
  }

  async hasAnyVault(): Promise<boolean> {
    if (await this.store.hasLegacyVault()) {
      return true;
    }
    for (const username of this.users.getKnownUsernames()) {
      if (await this.store.hasVault(username)) {
        return true;
      }
    }
    return false;
  }

  async hasLocalVault(username: string): Promise<boolean> {
    return this.store.hasVault(normalizeUsername(username));
  }

  getActiveUsername(): string | null {
    return this.users.getActiveUsername();
  }

  getKnownUsernames(): string[] {
    return this.users.getKnownUsernames();
  }

  private useUserScope(username: string): void {
    const normalized = normalizeUsername(username);
    this.store.setUserScope(normalized);
    this.users.setActiveUsername(normalized);
  }

  private driveScope(): string | undefined {
    return (
      this.session.vault?.meta.username?.trim().toLowerCase() ||
      this.users.getActiveUsername() ||
      undefined
    );
  }

  async registerUserOnServer(input: {
    username: string;
    password: string;
    recoveryCode: string;
    displayName?: string;
    recoveryEmail?: string;
    googleClientId?: string;
    driveFolderId?: string;
    driveAccountEmail?: string;
    googleIdentityEmail?: string;
  }): Promise<void> {
    try {
      await this.registry.registerUser({
        username: input.username,
        password: input.password,
        recoveryCode: input.recoveryCode,
        displayName: input.displayName,
        recoveryEmail: input.recoveryEmail,
        googleClientId: input.googleClientId,
        driveFolderId: input.driveFolderId,
        driveAccountEmail: input.driveAccountEmail,
        googleIdentityEmail: input.googleIdentityEmail,
      });
      this.users.rememberUsername(input.username);
    } catch (e) {
      AppLogger.warn('VaultService.registerUserOnServer: registry offline or failed', e);
      /* local vault still works if registry is offline */
    }
  }

  async syncUserRegistry(username: string, patch: {
    password?: string;
    recoveryCode?: string;
    recoveryEmail?: string;
    googleClientId?: string;
    driveFolderId?: string;
    driveAccountEmail?: string;
    googleIdentityEmail?: string;
    displayName?: string;
  }): Promise<void> {
    try {
      await this.registry.updateUser(username, patch);
    } catch {
      /* best effort */
    }
  }

  async lookupUserProfile(username: string) {
    return this.registry.lookupUser(username);
  }

  private defaultVault(ownerName?: string, username?: string): VaultData {
    const ts = nowIso();
    const { profiles, activeProfileId, folders } = defaultProfilesAndFolders(ts, ownerName);
    return {
      meta: { name: APP_NAME, username: username ? normalizeUsername(username) : undefined, createdAt: ts, updatedAt: ts, revision: 1 },
      profiles,
      activeProfileId,
      folders,
      collections: [],
      items: [],
      tags: [],
      auditLog: [],
      sync: { storageMode: 'device' },
    };
  }

  private async migrateLegacySyncSettings(vault: VaultData): Promise<void> {
    const raw = (await this.settings.load()) as unknown as Record<string, unknown>;
    const keys = [
      'storageMode',
      'googleClientId',
      'googleIdentityEmail',
      'googleIdentityId',
      'driveUsesSameGoogleAccount',
      'googleAccountEmail',
      'googleAccountId',
      'googleOnboardingComplete',
      'driveFolderId',
      'driveVerifiedAt',
      'lastSyncedAt',
    ] as const;
    let moved = false;
    ensureVaultShape(vault);
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== '' && value !== null && vault.sync![key] === undefined) {
        (vault.sync as Record<string, unknown>)[key] = value;
        moved = true;
      }
    }
    if (!moved) return;

    await this.settings.replace({
      theme: (raw['theme'] as AppSettings['theme']) || 'system',
      vaultRevision: Number(raw['vaultRevision'] || 0),
      installedAt: (raw['installedAt'] as string | null) ?? null,
    });
    await this.persist();
  }

  private shaped(): VaultData | null {
    const vault = this.session.vault;
    if (!vault) return null;
    ensureVaultShape(vault);
    return vault;
  }

  private async persist(): Promise<void> {
    if (!this.session.isUnlocked() || !this.session.key || !this.session.vault || !this.session.envelope) {
      AppLogger.error('VaultService.persist: LOCKED');
      throw new Error('LOCKED');
    }
    ensureVaultShape(this.session.vault);
    this.session.vault.meta.updatedAt = nowIso();
    this.session.vault.meta.revision = (this.session.vault.meta.revision || 0) + 1;
    const envelope = await resealVault(this.session.key, this.session.envelope, this.session.vault);
    await this.store.saveEnvelope(envelope);
    this.session.envelope = envelope;
    await this.settings.save({ vaultRevision: this.session.vault.meta.revision });
    this.syncService().scheduleAutoSync();
  }

  async createVault(username: string, password: string, ownerName?: string): Promise<{ vault: VaultData; recoveryCode: string }> {
    const nameErr = usernameError(username);
    if (nameErr) {
      AppLogger.error('VaultService.createVault: invalid username', { nameErr });
      throw new Error(nameErr);
    }
    const normalized = normalizeUsername(username);
    if (await this.store.hasVault(normalized)) {
      AppLogger.warn('VaultService.createVault: username already exists locally', { username: normalized });
      const err = new Error('USERNAME_LOCAL_EXISTS') as Error & { code?: string };
      err.code = 'USERNAME_LOCAL_EXISTS';
      throw err;
    }

    this.useUserScope(normalized);
    const vault = this.defaultVault(ownerName, normalized);
    const recoveryCode = generateRecoveryCode();
    appendAudit(vault, { action: 'vault.create', summary: `${APP_NAME} created`, meta: { username: normalized } });
    const { envelope, key } = await sealVault(password, vault);
    await this.store.saveEnvelope(envelope);
    await this.recovery().saveRecoveryBundle(key, recoveryCode);
    await this.settings.save({ installedAt: nowIso(), vaultRevision: 1, recoveryEmail: undefined });
    this.session.setSession({ key, vault, envelope });
    this.users.rememberUsername(normalized);
    AppLogger.info('Vault created', { username: normalized });
    return { vault, recoveryCode };
  }

  async unlockVault(username: string, password: string): Promise<VaultData> {
    const nameErr = usernameError(username);
    if (nameErr) {
      AppLogger.error('VaultService.unlockVault: invalid username', { nameErr });
      const err = new Error('USERNAME_INVALID') as Error & { code?: string };
      err.code = 'USERNAME_INVALID';
      throw err;
    }
    const normalized = normalizeUsername(username);
    this.useUserScope(normalized);

    let envelope = await this.store.loadEnvelope();
    if (!envelope) {
      await this.store.migrateLegacyToUser(normalized);
      envelope = await this.store.loadEnvelope();
    }
    if (!envelope) {
      AppLogger.warn('VaultService.unlockVault: no vault found', { username: normalized });
      const err = new Error('NO_VAULT') as Error & { code?: string };
      err.code = 'NO_VAULT';
      throw err;
    }

    try {
      await this.registry.verifyLogin(normalized, password);
    } catch {
    }

    let vault: VaultData;
    let key: CryptoKey;
    try {
      ({ vault, key } = await openVault(password, envelope));
    } catch (e) {
      AppLogger.error('VaultService.unlockVault: wrong password', e);
      const err = new Error('WRONG_PASSWORD') as Error & { code?: string };
      err.code = 'WRONG_PASSWORD';
      throw err;
    }
    ensureVaultShape(vault);
    if (!vault.meta.username) {
      vault.meta.username = normalized;
    }
    this.session.setSession({ key, vault, envelope });
    await this.migrateLegacySyncSettings(vault);
    if (this.session.key) {
      await this.recovery().ensureMasterBackupRecord(this.session.key);
      const recoveryEmail = (await this.settings.load()).recoveryEmail?.trim();
      if (recoveryEmail) {
        await this.recovery().ensureEmailRecoveryRecord(this.session.key, recoveryEmail);
      }
    }
    await this.syncService().mergeOnLogin();
    appendAudit(this.session.vault!, {
      action: 'session.unlock',
      summary: 'Logged in to app',
      meta: {
        username: normalized,
        ...this.profileAuditMeta(this.session.vault!, this.session.vault!.activeProfileId),
      },
    });
    await this.persist();
    this.syncService().refreshStatusMessage();
    AppLogger.info('Vault unlocked', { username: normalized, revision: vault.meta.revision });
    return this.session.vault!;
  }

  async lockVault(reason: 'manual' | 'auto' = 'manual'): Promise<void> {
    if (this.session.isUnlocked() && this.session.vault) {
      appendAudit(this.session.vault, {
        action: reason === 'auto' ? 'session.lock.auto' : 'session.lock',
        summary: reason === 'auto' ? 'Auto-locked — logged out' : 'Logged out — vault locked',
        meta: {
          reason,
          ...this.profileAuditMeta(this.session.vault, this.session.vault.activeProfileId),
        },
      });
      try {
        await this.persist();
      } catch (e) {
        AppLogger.warn('VaultService.lockVault: persist failed before clear', e);
      }
    }
    this.session.clear();
    AppLogger.info('Vault locked', { reason });
  }

  listAuditLog(): AuditEntry[] {
    const vault = this.getVault();
    if (!vault?.auditLog?.length) return [];
    return vault.auditLog.slice();
  }

  async recordAudit(input: {
    action: string;
    summary: string;
    meta?: Record<string, string | number | boolean>;
  }): Promise<void> {
    const vault = this.getVault();
    if (!vault) return;
    appendAudit(vault, input);
    await this.persist();
  }

  getVault(): VaultData | null {
    if (!this.session.isUnlocked()) return null;
    return this.shaped();
  }

  getActiveProfileId(): string | null {
    return this.getVault()?.activeProfileId ?? null;
  }

  private sanitizeFolderIds(folderIds: string[] | undefined, profileId: string): string[] {
    const allowed = folderIdsForProfile(this.getVault()!, profileId);
    return (folderIds || []).filter((id) => allowed.has(id));
  }

  private profileAuditMeta(vault: VaultData, profileId: string): { profileId: string; profile: string } {
    const profile = vault.profiles.find((p) => p.id === profileId);
    return { profileId, profile: profile?.name || 'Profile' };
  }

  assertAttachmentInActiveProfile(attachmentId: string): void {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const pid = vault.activeProfileId;
    const owned = vault.items.some(
      (item) => item.profileId === pid && (item.attachments || []).some((a) => a.id === attachmentId),
    );
    if (!owned) throw profileAccessError();
  }

  listProfiles(): Profile[] {
    return this.getVault()?.profiles.slice() || [];
  }

  async setActiveProfile(profileId: string): Promise<void> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const profile = vault.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('UNKNOWN_PROFILE');
    vault.activeProfileId = profileId;
    appendAudit(vault, {
      action: 'profile.switch',
      summary: `Switched to profile “${profile.name}”`,
      meta: this.profileAuditMeta(vault, profileId),
    });
    await this.persist();
  }

  listFolders(): Folder[] {
    const vault = this.getVault();
    if (!vault) return [];
    const pid = vault.activeProfileId;
    return vault.folders.filter((f) => f.profileId === pid);
  }

  async upsertFolder(input: { id?: string; name: string }): Promise<Folder> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const ts = nowIso();
    const pid = vault.activeProfileId;
    let folder = input.id ? vault.folders.find((f) => f.id === input.id) : undefined;
    const creating = !folder;
    if (folder) {
      assertSameProfile(pid, folder.profileId);
      folder.name = input.name.trim();
      folder.updatedAt = ts;
    } else {
      folder = {
        id: input.id || createId('folder'),
        name: input.name.trim() || 'Folder',
        profileId: pid,
        createdAt: ts,
      };
      vault.folders.push(folder);
    }
    appendAudit(vault, {
      action: creating ? 'folder.create' : 'folder.update',
      summary: creating ? `Folder created “${folder.name}”` : `Folder renamed “${folder.name}”`,
      meta: { folderId: folder.id, name: folder.name, ...this.profileAuditMeta(vault, pid) },
    });
    await this.persist();
    return folder;
  }

  async deleteFolder(folderId: string): Promise<void> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const folder = vault.folders.find((f) => f.id === folderId);
    if (!folder) throw new Error('UNKNOWN_FOLDER');
    assertSameProfile(vault.activeProfileId, folder.profileId);
    const name = folder.name;
    vault.folders = vault.folders.filter((f) => f.id !== folderId);
    for (const item of vault.items) {
      if (item.profileId !== folder.profileId) continue;
      item.folderIds = (item.folderIds || []).filter((fid) => fid !== folderId);
    }
    appendAudit(vault, {
      action: 'folder.delete',
      summary: `Folder deleted “${name}”`,
      meta: { folderId, name, ...this.profileAuditMeta(vault, folder.profileId) },
    });
    await this.persist();
  }

  listItems(opts: { folderId?: string } = {}): VaultItem[] {
    const vault = this.getVault();
    if (!vault) return [];
    const pid = vault.activeProfileId;
    return vault.items.filter((i) => {
      if (i.profileId !== pid) return false;
      if (opts.folderId && !(i.folderIds || []).includes(opts.folderId)) return false;
      return true;
    });
  }

  listAllItems(): VaultItem[] {
    const vault = this.getVault();
    if (!vault) return [];
    return vault.items.slice();
  }

  async upsertItem(input: Partial<VaultItem> & { type?: string; title?: string }): Promise<VaultItem> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const ts = nowIso();
    const pid = vault.activeProfileId;
    const existing = input.id ? vault.items.find((i) => i.id === input.id) : undefined;
    const prevAttachments = existing?.attachments ? [...existing.attachments] : [];
    let item = existing;
    const creating = !item;

    if (item) {
      assertSameProfile(pid, item.profileId);
      const folderIds = this.sanitizeFolderIds(input.folderIds ?? item.folderIds, pid);
      Object.assign(item, {
        type: input.type ?? item.type,
        title: input.title ?? item.title,
        description: input.description ?? item.description,
        favorite: input.favorite ?? item.favorite,
        tags: input.tags ?? item.tags,
        profileId: pid,
        folderIds,
        fields: input.fields ?? item.fields,
        customFields: input.customFields ?? item.customFields,
        attachments: input.attachments ?? item.attachments,
        attachmentIds: (input.attachments ?? item.attachments ?? []).map((a) => a.id),
        updatedAt: ts,
      });
    } else {
      const folderIds = this.sanitizeFolderIds(input.folderIds, pid);
      item = {
        id: input.id || createId('item'),
        type: input.type || 'password',
        title: input.title || 'Untitled',
        description: input.description || '',
        favorite: Boolean(input.favorite),
        tags: input.tags || [],
        profileId: pid,
        folderIds,
        collectionIds: folderIds,
        fields: input.fields || emptyFieldsForType(input.type || 'password'),
        customFields: input.customFields || [],
        attachments: input.attachments || [],
        attachmentIds: (input.attachments || []).map((a) => a.id),
        createdAt: ts,
        updatedAt: ts,
      };
      vault.items.push(item);
    }

    const fileNames = (item.attachments || []).map((a) => a.fileName).join(', ');
    appendAudit(vault, {
      action: creating ? 'item.create' : 'item.update',
      summary: creating ? `Added “${item.title}”` : `Updated “${item.title}”`,
      meta: {
        itemId: item.id,
        title: item.title,
        type: item.type,
        ...this.profileAuditMeta(vault, pid),
        ...(fileNames ? { files: fileNames } : {}),
      },
    });

    if (!creating) {
      const newIds = new Set((item.attachments || []).map((a) => a.id));
      const oldIds = new Set(prevAttachments.map((a) => a.id));
      for (const att of item.attachments || []) {
        if (!oldIds.has(att.id)) {
          appendAudit(vault, {
            action: 'attachment.add',
            summary: `File added “${att.fileName}” to “${item.title}”`,
            meta: {
              itemId: item.id,
              title: item.title,
              fileName: att.fileName,
              fileSize: att.size,
              mimeType: att.mimeType,
              ...this.profileAuditMeta(vault, pid),
            },
          });
        }
      }
      for (const att of prevAttachments) {
        if (!newIds.has(att.id)) {
          appendAudit(vault, {
            action: 'attachment.remove',
            summary: `File removed “${att.fileName}” from “${item.title}”`,
            meta: {
              itemId: item.id,
              title: item.title,
              fileName: att.fileName,
              ...this.profileAuditMeta(vault, pid),
            },
          });
        }
      }
    } else if (item.attachments?.length) {
      for (const att of item.attachments) {
        appendAudit(vault, {
          action: 'attachment.add',
          summary: `File added “${att.fileName}” to “${item.title}”`,
          meta: {
            itemId: item.id,
            title: item.title,
            fileName: att.fileName,
            fileSize: att.size,
            mimeType: att.mimeType,
            ...this.profileAuditMeta(vault, pid),
          },
        });
      }
    }

    await this.persist();
    return item;
  }

  async deleteItem(id: string): Promise<void> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const item = vault.items.find((i) => i.id === id);
    if (!item) throw new Error('UNKNOWN_ITEM');
    assertSameProfile(vault.activeProfileId, item.profileId);
    const title = item.title;
    const files = (item.attachments || []).map((a) => a.fileName).join(', ');
    vault.items = vault.items.filter((i) => i.id !== id);
    appendAudit(vault, {
      action: 'item.delete',
      summary: `Deleted “${title}”`,
      meta: {
        itemId: id,
        title,
        type: item.type,
        fileCount: item.attachments?.length || 0,
        ...this.profileAuditMeta(vault, item.profileId),
        ...(files ? { files } : {}),
      },
    });
    await this.persist();
  }

  getSyncAccount(): VaultSyncAccount {
    const vault = this.getVault();
    return vault?.sync ? { ...vault.sync } : {};
  }

  async updateSyncAccount(
    partial: Partial<VaultSyncAccount>,
    opts?: { skipAudit?: boolean },
  ): Promise<VaultSyncAccount> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    ensureVaultShape(vault);
    vault.sync = { ...vault.sync, ...partial };
    if (!opts?.skipAudit) {
      appendAudit(vault, { action: 'sync.update', summary: 'Sync settings updated' });
    }
    await this.persist();
    return { ...vault.sync };
  }

  async clearGoogleAccount(): Promise<void> {
    await this.updateSyncAccount({
      googleIdentityEmail: '',
      googleIdentityId: '',
      googleAccountEmail: '',
      googleAccountId: '',
      driveFolderId: '',
      driveVerifiedAt: null,
      lastSyncedAt: null,
      googleOnboardingComplete: false,
    });
  }

  recoveryGoogleId(sync?: VaultSyncAccount | null): string {
    const s = sync ?? this.getSyncAccount();
    return (s.googleIdentityId || s.googleAccountId || '').trim();
  }

  async verifyMasterPassword(password: string): Promise<void> {
    if (!this.session.envelope) {
      AppLogger.error('VaultService.verifyMasterPassword: LOCKED');
      throw new Error('LOCKED');
    }
    try {
      await openVault(password, this.session.envelope);
    } catch (e) {
      AppLogger.error('VaultService.verifyMasterPassword: WRONG_PASSWORD', e);
      const err = new Error('WRONG_PASSWORD') as Error & { code?: string };
      err.code = 'WRONG_PASSWORD';
      throw err;
    }
  }

  async completeDeviceOnlyOnboarding(input: {
    masterPassword: string;
    recoveryCode: string;
  }): Promise<void> {
    await this.verifyMasterPassword(input.masterPassword);

    await this.updateSyncAccount({
      storageMode: 'device',
      googleOnboardingComplete: true,
    });

    appendAudit(this.session.vault!, {
      action: 'vault.setup.complete',
      summary: 'Vault setup complete (this device only)',
    });
    appendAudit(this.session.vault!, { action: 'session.login', summary: 'Logged in to app — setup complete' });
    await this.persist();

    const username = this.session.vault?.meta.username || this.users.getActiveUsername();
    if (username) {
      await this.registerUserOnServer({
        username,
        password: input.masterPassword,
        recoveryCode: input.recoveryCode,
        displayName: this.getSelfProfile()?.name,
      });
    }
    AppLogger.info('Device-only onboarding complete', { username });
  }

  async completeGoogleOnboarding(input: {
    masterPassword: string;
    recoveryCode: string;
    googleClientId: string;
    identityEmail: string;
    identityId: string;
    driveUsesSameAccount: boolean;
    driveEmail?: string;
    driveId?: string;
    syncToDrive?: boolean;
    saveOnPhone?: boolean;
    driveFolderId?: string;
    driveVerifiedAt?: string | null;
  }): Promise<void> {
    await this.verifyMasterPassword(input.masterPassword);
    const clientId = input.googleClientId.trim();
    if (!clientId) {
      AppLogger.error('VaultService.completeGoogleOnboarding: NO_CLIENT_ID');
      throw new Error('NO_CLIENT_ID');
    }
    if (!input.identityEmail || !input.identityId) {
      AppLogger.error('VaultService.completeGoogleOnboarding: NO_GOOGLE_IDENTITY');
      throw new Error('NO_GOOGLE_IDENTITY');
    }

    const driveEmail = input.driveUsesSameAccount ? input.identityEmail : input.driveEmail;
    const driveId = input.driveUsesSameAccount ? input.identityId : input.driveId;
    if (!driveEmail || !driveId) {
      AppLogger.error('VaultService.completeGoogleOnboarding: NO_DRIVE_ACCOUNT');
      throw new Error('NO_DRIVE_ACCOUNT');
    }
    const syncToDrive = input.syncToDrive !== false;

    await this.settings.save({ googleClientId: clientId, recoveryEmail: input.identityEmail.trim().toLowerCase() });
    await this.updateSyncAccount({
      googleClientId: clientId,
      googleIdentityEmail: input.identityEmail,
      googleIdentityId: input.identityId,
      driveUsesSameGoogleAccount: input.driveUsesSameAccount,
      googleAccountEmail: driveEmail,
      googleAccountId: driveId,
      storageMode: syncToDrive ? 'hybrid' : 'device',
      googleOnboardingComplete: true,
      driveFolderId: input.driveFolderId || '',
      driveVerifiedAt: input.driveVerifiedAt ?? (input.driveFolderId ? nowIso() : null),
    });

    appendAudit(this.session.vault!, {
      action: 'sync.google.onboard',
      summary: input.driveUsesSameAccount
        ? 'Google account linked for identity and Drive backup'
        : 'Google identity and separate Drive account linked',
    });
    appendAudit(this.session.vault!, { action: 'session.login', summary: 'Logged in to app — setup complete' });
    if (this.session.key) {
      await this.recovery().ensureEmailRecoveryRecord(this.session.key, input.identityEmail);
    }
    await this.persist();
    await this.uploadRecoveryIfPossible();

    const username = this.session.vault?.meta.username || this.users.getActiveUsername();
    let driveFolderId = input.driveFolderId || '';
    if (syncToDrive && !driveFolderId) {
      void this.syncService().pushSync(true);
      try {
        const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
        driveFolderId = layout.rootId;
      } catch (e) {
        AppLogger.warn('VaultService.completeGoogleOnboarding: Drive layout failed (best effort)', e);
      }
    }

    if (username) {
      await this.registerUserOnServer({
        username,
        password: input.masterPassword,
        recoveryCode: input.recoveryCode,
        displayName: this.getSelfProfile()?.name,
        recoveryEmail: input.identityEmail,
        googleIdentityEmail: input.identityEmail,
        googleClientId: clientId,
        driveFolderId,
        driveAccountEmail: driveEmail,
      });
    }
    AppLogger.info('Google onboarding complete', { username, driveFolderId, syncToDrive });
  }

  prepareRecoveryForUser(username: string): void {
    this.useUserScope(username);
  }

  async upsertProfile(input: { id?: string; name: string; relationship?: string }): Promise<Profile> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    const ts = nowIso();
    let profile = input.id ? vault.profiles.find((p) => p.id === input.id) : undefined;
    const creating = !profile;
    if (profile) {
      profile.name = input.name.trim();
      profile.relationship = input.relationship || profile.relationship;
      profile.updatedAt = ts;
    } else {
      profile = {
        id: input.id || createId('prof'),
        name: input.name.trim() || 'Profile',
        relationship: input.relationship || 'other',
        color: '#5c5a55',
        createdAt: ts,
      };
      vault.profiles.push(profile);
    }
    appendAudit(vault, {
      action: creating ? 'profile.create' : 'profile.update',
      summary: creating ? `Profile added “${profile.name}”` : `Profile updated “${profile.name}”`,
      meta: this.profileAuditMeta(vault, profile.id),
    });
    await this.persist();
    return profile;
  }

  async deleteProfile(profileId: string): Promise<void> {
    const vault = this.getVault();
    if (!vault) throw new Error('LOCKED');
    if (vault.profiles.length <= 1) throw new Error('LAST_PROFILE');
    if (profileId === vault.activeProfileId) throw new Error('ACTIVE_PROFILE');
    const profile = vault.profiles.find((p) => p.id === profileId);
    const name = profile?.name || 'Profile';
    vault.profiles = vault.profiles.filter((p) => p.id !== profileId);
    vault.folders = vault.folders.filter((f) => f.profileId !== profileId);
    vault.items = vault.items.filter((i) => i.profileId !== profileId);
    if (vault.activeProfileId === profileId) {
      vault.activeProfileId = vault.profiles[0].id;
    }
    appendAudit(vault, {
      action: 'profile.delete',
      summary: `Profile deleted “${name}”`,
      meta: { ...this.profileAuditMeta(vault, profileId), name },
    });
    await this.persist();
  }

  getSelfProfile(): Profile | null {
    const vault = this.getVault();
    if (!vault) return null;
    return vault.profiles.find((p) => p.id === 'prof_me' || p.relationship === 'self') || null;
  }

  async updateOwnerName(name: string): Promise<Profile> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('NAME_REQUIRED');
    const self = this.getSelfProfile();
    if (!self) throw new Error('NO_OWNER');
    return this.upsertProfile({ id: self.id, name: trimmed, relationship: 'self' });
  }

  async syncRecoveryEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    await this.settings.save({ recoveryEmail: normalized });
    if (this.session.isUnlocked() && this.session.key) {
      await this.recovery().ensureEmailRecoveryRecord(this.session.key, normalized);
      await this.uploadRecoveryIfPossible();
    }
  }

  /**
   * Reset master password using vault-recovery.enc on Google Drive.
   * Requires the same Google account that was linked while logged in.
   */
  async resetMasterPasswordViaGoogle(input: {
    clientId: string;
    googleAccountId: string;
    googleAccountEmail: string;
    newPassword: string;
  }): Promise<void> {
    const clientId = input.clientId.trim();
    if (!clientId) {
      AppLogger.error('VaultService.resetMasterPasswordViaGoogle: NO_CLIENT_ID');
      throw new Error('NO_CLIENT_ID');
    }
    if (!input.newPassword || input.newPassword.length < 8) throw new Error('PASSWORD_TOO_SHORT');

    await this.google().ensureAccessToken(clientId);
    const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
    const vaultKey = await this.recovery().unlockVaultKeyFromGoogleRecovery(clientId, input.googleAccountId, layout.rootId);

    let envelope: VaultEnvelope | null = await this.drive().downloadVaultEnc(clientId, layout.rootId);
    if (!envelope) {
      envelope = (await this.store.loadEnvelope()) ?? null;
    }
    if (!envelope) {
      const err = new Error('NO_VAULT') as Error & { code?: string };
      err.code = 'NO_VAULT';
      throw err;
    }

    const { vault: peek } = await openVaultWithKey(envelope, vaultKey);
    const storageMode =
      peek.sync?.storageMode && peek.sync.storageMode !== 'device' ? peek.sync.storageMode : 'hybrid';

    await this.applyMasterPasswordReset({
      envelope,
      vaultKey,
      newPassword: input.newPassword,
      auditSummary: 'Master password reset via Google Drive recovery',
      syncPatch: {
        storageMode,
        googleClientId: clientId,
        googleIdentityEmail: peek.sync?.googleIdentityEmail || input.googleAccountEmail,
        googleIdentityId: peek.sync?.googleIdentityId || peek.sync?.googleAccountId || input.googleAccountId,
        googleAccountId: peek.sync?.googleAccountId || input.googleAccountId,
        googleAccountEmail: peek.sync?.googleAccountEmail || input.googleAccountEmail,
        driveUsesSameGoogleAccount: peek.sync?.driveUsesSameGoogleAccount,
        googleOnboardingComplete: true,
        driveFolderId: layout.rootId,
        lastSyncedAt: nowIso(),
      },
      googleAccountId: peek.sync?.googleIdentityId || peek.sync?.googleAccountId || input.googleAccountId,
      clientId,
      driveRootId: layout.rootId,
    });
    AppLogger.info('Password reset via Google complete');
  }

  async resetMasterPasswordViaEmail(email: string, newPassword: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new Error('EMAIL_REQUIRED');
    if (!newPassword || newPassword.length < 8) throw new Error('PASSWORD_TOO_SHORT');

    const settings = await this.settings.load();
    const clientId = settings.googleClientId?.trim();

    let emailRecord = (await this.recovery().loadBundle())?.emailRecord ?? null;
    if (!emailRecord && clientId) {
      try {
        await this.google().ensureAccessToken(clientId);
        const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
        emailRecord = await this.recovery().downloadEmailRecoveryFromDrive(clientId, layout.rootId);
      } catch {
        /* local only */
      }
    }

    const vaultKey = await this.recovery().unlockVaultKeyFromEmail(normalized, emailRecord);

    let envelope: VaultEnvelope | null = (await this.store.loadEnvelope()) ?? null;
    if (!envelope && clientId) {
      try {
        await this.google().ensureAccessToken(clientId);
        const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
        envelope = await this.drive().downloadVaultEnc(clientId, layout.rootId);
      } catch {
        /* fall through */
      }
    }
    if (!envelope) {
      const err = new Error('NO_VAULT') as Error & { code?: string };
      err.code = 'NO_VAULT';
      throw err;
    }

    await this.applyMasterPasswordReset({
      envelope,
      vaultKey,
      newPassword,
      auditSummary: 'Master password reset via email recovery PIN',
    });
    AppLogger.info('Password reset via email complete');
  }

  async resetMasterPasswordViaCode(recoveryCode: string, newPassword: string): Promise<void> {
    if (!recoveryCode.trim()) throw new Error('CODE_REQUIRED');
    if (!newPassword || newPassword.length < 8) throw new Error('PASSWORD_TOO_SHORT');

    const useMaster = isMasterRecoveryCode(recoveryCode);
    const settings = await this.settings.load();
    const clientId = settings.googleClientId?.trim();

    let envelope: VaultEnvelope | null = (await this.store.loadEnvelope()) ?? null;
    if (!envelope && clientId) {
      try {
        await this.google().ensureAccessToken(clientId);
        const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
        envelope = await this.drive().downloadVaultEnc(clientId, layout.rootId);
      } catch {
        /* fall through */
      }
    }
    if (!envelope) {
      const err = new Error('NO_VAULT') as Error & { code?: string };
      err.code = 'NO_VAULT';
      throw err;
    }

    let vaultKey: CryptoKey;
    if (useMaster) {
      if (envelope.masterRecovery) {
        vaultKey = await this.recovery().unlockVaultKeyFromEnvelopeMaster(envelope);
      } else {
        let masterCodeRecord = (await this.recovery().loadBundle())?.masterCodeRecord ?? null;
        if (!masterCodeRecord && clientId) {
          try {
            await this.google().ensureAccessToken(clientId);
            const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
            masterCodeRecord = await this.recovery().downloadMasterCodeRecoveryFromDrive(clientId, layout.rootId);
          } catch {
            /* local only */
          }
        }
        vaultKey = await this.recovery().unlockVaultKeyFromMasterCode(masterCodeRecord);
      }
    } else {
      let codeRecord = (await this.recovery().loadBundle())?.codeRecord ?? null;
      if (!codeRecord && clientId) {
        try {
          await this.google().ensureAccessToken(clientId);
          const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
          codeRecord = await this.recovery().downloadCodeRecoveryFromDrive(clientId, layout.rootId);
        } catch {
          /* local only */
        }
      }
      vaultKey = await this.recovery().unlockVaultKeyFromCode(recoveryCode, codeRecord);
    }

    await this.applyMasterPasswordReset({
      envelope,
      vaultKey,
      newPassword,
      auditSummary: useMaster
        ? 'Master password reset via universal backup recovery code'
        : 'Master password reset via recovery code',
      recoveryCode: useMaster ? undefined : recoveryCode,
    });
    AppLogger.info('Password reset via recovery code complete', { useMaster });
  }

  async regenerateRecoveryCode(currentPassword: string): Promise<string> {
    if (!this.session.isUnlocked() || !this.session.envelope || !this.session.key) {
      throw new Error('LOCKED');
    }
    try {
      await openVault(currentPassword, this.session.envelope);
    } catch {
      const err = new Error('WRONG_PASSWORD') as Error & { code?: string };
      err.code = 'WRONG_PASSWORD';
      throw err;
    }
    const recoveryCode = generateRecoveryCode();
    await this.recovery().saveRecoveryBundle(this.session.key, recoveryCode);
    await this.uploadRecoveryIfPossible();
    appendAudit(this.session.vault!, {
      action: 'vault.recovery.regenerate',
      summary: 'Recovery code regenerated',
    });
    await this.persist();
    return recoveryCode;
  }

  hasCodeRecovery(): Promise<boolean> {
    return this.recovery().hasCodeRecovery();
  }

  private async applyMasterPasswordReset(input: {
    envelope: VaultEnvelope;
    vaultKey: CryptoKey;
    newPassword: string;
    auditSummary: string;
    recoveryCode?: string;
    syncPatch?: Partial<VaultSyncAccount>;
    googleAccountId?: string;
    clientId?: string;
    driveRootId?: string;
  }): Promise<void> {
    const { vault } = await openVaultWithKey(input.envelope, input.vaultKey);
    ensureVaultShape(vault);
    appendAudit(vault, { action: 'vault.password.reset', summary: input.auditSummary });

    if (input.syncPatch) {
      vault.sync = { ...vault.sync, ...input.syncPatch };
    }

    const { envelope: nextEnvelope, key: nextKey } = await sealVault(input.newPassword, vault);
    await this.store.saveEnvelope(nextEnvelope);

    if (input.clientId && input.driveRootId) {
      await this.drive().uploadVaultEnc(input.clientId, input.driveRootId, nextEnvelope);
      if (input.googleAccountId) {
        await this.recovery().uploadGoogleRecovery(input.clientId, input.driveRootId, nextKey, input.googleAccountId);
      }
      await this.recovery().uploadCodeRecoveryToDrive(input.clientId, input.driveRootId);
    }

    if (input.recoveryCode) {
      await this.recovery().saveRecoveryBundle(nextKey, input.recoveryCode);
    } else {
      await this.recovery().refreshRecoveryBundle(nextKey);
      await this.recovery().ensureMasterBackupRecord(nextKey);
    }

    this.session.setSession({ key: nextKey, vault, envelope: nextEnvelope });
    const settings = await this.settings.load();
    await this.settings.save({
      googleClientId: input.clientId || settings.googleClientId,
      vaultRevision: vault.meta.revision,
      installedAt: settings.installedAt,
    });
    this.syncService().refreshStatusMessage();

    const username = vault.meta.username || this.users.getActiveUsername();
    if (username) {
      await this.syncUserRegistry(username, {
        password: input.newPassword,
        recoveryCode: input.recoveryCode,
        googleClientId: input.clientId,
        driveFolderId: input.driveRootId,
      });
    }
  }

  async uploadRecoveryIfPossible(): Promise<void> {
    if (!this.session.isUnlocked() || !this.session.key) return;
    const sync = this.session.vault?.sync;
    const clientId = sync?.googleClientId?.trim();
    const googleAccountId = this.recoveryGoogleId(sync);
    if (!clientId || !googleAccountId || !sync?.googleAccountEmail) return;
    if (sync.storageMode !== 'hybrid' && sync.storageMode !== 'drive') return;

    try {
      await this.google().ensureAccessToken(clientId);
      const layout = await this.drive().ensureDriveLayout(clientId, this.driveScope());
      await this.recovery().uploadGoogleRecovery(clientId, layout.rootId, this.session.key, googleAccountId);
      await this.recovery().uploadCodeRecoveryToDrive(clientId, layout.rootId);
    } catch {
      // Recovery upload is best-effort; vault sync still works without it.
    }
  }

  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!this.session.isUnlocked() || !this.session.vault || !this.session.envelope) {
      throw new Error('LOCKED');
    }
    if (!newPassword || newPassword.length < 8) throw new Error('PASSWORD_TOO_SHORT');
    try {
      await openVault(currentPassword, this.session.envelope);
    } catch {
      const err = new Error('WRONG_PASSWORD') as Error & { code?: string };
      err.code = 'WRONG_PASSWORD';
      throw err;
    }
    const vault = this.session.vault;
    appendAudit(vault, { action: 'vault.password.change', summary: 'Master password changed' });
    const { envelope, key } = await sealVault(newPassword, vault);
    await this.store.saveEnvelope(envelope);
    this.session.setSession({ key, vault, envelope });
    await this.settings.save({ vaultRevision: vault.meta.revision });
    await this.recovery().refreshRecoveryBundle(key);
    await this.uploadRecoveryIfPossible();
    this.syncService().scheduleAutoSync();
  }
}
