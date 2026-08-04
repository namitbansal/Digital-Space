import { Injectable, inject } from '@angular/core';
import { EncryptedAttachmentRecord, VaultEnvelope, VaultRecoveryRecord, VaultCodeRecoveryRecord, VaultEmailRecoveryRecord } from '../models/vault.models';
import { GoogleAccountService } from '../auth/google-account.service';
import { APP_NAME } from '../constants/app-name';
import { AppLogger } from '../services/logger.util';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER = APP_NAME;

export interface DriveLayout {
  /** Folder for this vault's encrypted files (`vault.enc`, recovery files). */
  rootId: string;
  attachmentsId: string;
  backupsId: string;
  /** Top-level app folder in Google Drive (e.g. "Personal Vault"). */
  appRootId: string;
}

@Injectable({ providedIn: 'root' })
export class DriveApiService {
  private readonly google = inject(GoogleAccountService);

  private async authHeaders(clientId: string, json = true): Promise<HeadersInit> {
    const token = await this.google.ensureAccessToken(clientId);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  private async driveFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const message = `Drive API ${res.status}: ${text.slice(0, 200)}`;
      AppLogger.error('DriveApiService.driveFetch failed', { status: res.status, message });
      throw new Error(message);
    }
    if (res.status === 204) return null as T;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return (await res.json()) as T;
    return (await res.text()) as T;
  }

  async ensureDriveLayout(clientId: string, vaultScope?: string): Promise<DriveLayout> {
    const appRootId = await this.findOrCreateAppFolder(clientId);
    const scope = vaultScope?.trim().toLowerCase();
    const rootId = scope ? await this.ensureChildFolder(clientId, appRootId, scope) : appRootId;
    const attachmentsId = await this.ensureChildFolder(clientId, rootId, 'attachments');
    const backupsId = await this.ensureChildFolder(clientId, rootId, 'backups');
    const layout = { rootId, attachmentsId, backupsId, appRootId };
    return layout;
  }

  /** Folders under an existing vault root (scoped or legacy). */
  async layoutForRoot(clientId: string, vaultRootId: string): Promise<DriveLayout> {
    const appRootId = await this.findOrCreateAppFolder(clientId);
    const attachmentsId = await this.ensureChildFolder(clientId, vaultRootId, 'attachments');
    const backupsId = await this.ensureChildFolder(clientId, vaultRootId, 'backups');
    return { rootId: vaultRootId, attachmentsId, backupsId, appRootId };
  }

  /** Try scoped vault folder first, then legacy app root (pre–per-user folders). */
  async resolveVaultRootId(clientId: string, vaultScope?: string): Promise<string> {
    const layout = await this.ensureDriveLayout(clientId, vaultScope);
    const scoped = await this.downloadVaultEnc(clientId, layout.rootId);
    if (scoped || !vaultScope?.trim()) return layout.rootId;
    const legacy = await this.ensureDriveLayout(clientId);
    const legacyVault = await this.downloadVaultEnc(clientId, legacy.rootId);
    return legacyVault ? legacy.rootId : layout.rootId;
  }

  async uploadVaultEnc(clientId: string, parentId: string, envelope: VaultEnvelope): Promise<void> {
    await this.uploadJsonFile(clientId, parentId, 'vault.enc', envelope);
  }

  async downloadVaultEnc(clientId: string, parentId: string): Promise<VaultEnvelope | null> {
    return this.downloadJsonFile<VaultEnvelope>(clientId, parentId, 'vault.enc');
  }

  async uploadRecoveryEnc(clientId: string, parentId: string, record: VaultRecoveryRecord): Promise<void> {
    await this.uploadJsonFile(clientId, parentId, 'vault-recovery.enc', record);
  }

  async downloadRecoveryEnc(clientId: string, parentId: string): Promise<VaultRecoveryRecord | null> {
    return this.downloadJsonFile<VaultRecoveryRecord>(clientId, parentId, 'vault-recovery.enc');
  }

  async uploadCodeRecoveryEnc(clientId: string, parentId: string, record: VaultCodeRecoveryRecord): Promise<void> {
    await this.uploadJsonFile(clientId, parentId, 'vault-recovery-code.enc', record);
  }

  async downloadCodeRecoveryEnc(clientId: string, parentId: string): Promise<VaultCodeRecoveryRecord | null> {
    return this.downloadJsonFile<VaultCodeRecoveryRecord>(clientId, parentId, 'vault-recovery-code.enc');
  }

  async uploadMasterCodeRecoveryEnc(clientId: string, parentId: string, record: VaultCodeRecoveryRecord): Promise<void> {
    await this.uploadJsonFile(clientId, parentId, 'vault-master-recovery-code.enc', record);
  }

  async downloadMasterCodeRecoveryEnc(clientId: string, parentId: string): Promise<VaultCodeRecoveryRecord | null> {
    return this.downloadJsonFile<VaultCodeRecoveryRecord>(clientId, parentId, 'vault-master-recovery-code.enc');
  }

  async uploadEmailRecoveryEnc(clientId: string, parentId: string, record: VaultEmailRecoveryRecord): Promise<void> {
    await this.uploadJsonFile(clientId, parentId, 'vault-email-recovery.enc', record);
  }

  async downloadEmailRecoveryEnc(clientId: string, parentId: string): Promise<VaultEmailRecoveryRecord | null> {
    return this.downloadJsonFile<VaultEmailRecoveryRecord>(clientId, parentId, 'vault-email-recovery.enc');
  }

  /** Upload attachment as encrypted record only — `{ id, iv, ciphertext }`, never plaintext bytes. */
  async uploadAttachmentEnc(clientId: string, folderId: string, record: EncryptedAttachmentRecord): Promise<void> {
    await this.uploadJsonFile(clientId, folderId, `${record.id}.enc`, record);
  }

  async downloadAttachmentEnc(
    clientId: string,
    folderId: string,
    id: string,
  ): Promise<EncryptedAttachmentRecord | null> {
    return this.downloadJsonFile<EncryptedAttachmentRecord>(clientId, folderId, `${id}.enc`);
  }

  async listAttachmentIds(clientId: string, folderId: string): Promise<string[]> {
    const headers = await this.authHeaders(clientId);
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains '.enc'`);
    const found = await this.driveFetch<{ files?: { name: string }[] }>(
      `${DRIVE}/files?q=${q}&fields=files(name)`,
      { headers },
    );
    return (found.files || [])
      .map((f) => f.name.replace(/\.enc$/, ''))
      .filter(Boolean);
  }

  async backupEnvelope(clientId: string, backupsFolderId: string, envelope: VaultEnvelope, label: string): Promise<void> {
    const name = `vault-backup-${label || Date.now()}.enc`;
    await this.uploadJsonFile(clientId, backupsFolderId, name, envelope);
  }

  private async findOrCreateAppFolder(clientId: string): Promise<string> {
    const headers = await this.authHeaders(clientId);
    const q = encodeURIComponent(
      `name='${APP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const found = await this.driveFetch<{ files?: { id: string }[] }>(
      `${DRIVE}/files?q=${q}&spaces=drive&fields=files(id,name)`,
      { headers },
    );
    if (found.files?.length) return found.files[0].id;

    const created = await this.driveFetch<{ id: string }>(`${DRIVE}/files?fields=id,name`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: APP_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
    });
    return created.id;
  }

  private async ensureChildFolder(clientId: string, parentId: string, name: string): Promise<string> {
    const headers = await this.authHeaders(clientId);
    const q = encodeURIComponent(
      `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const found = await this.driveFetch<{ files?: { id: string }[] }>(
      `${DRIVE}/files?q=${q}&fields=files(id,name)`,
      { headers },
    );
    if (found.files?.length) return found.files[0].id;

    const created = await this.driveFetch<{ id: string }>(`${DRIVE}/files?fields=id,name`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    });
    return created.id;
  }

  private async findFileInFolder(clientId: string, parentId: string, name: string) {
    const headers = await this.authHeaders(clientId);
    const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and trashed=false`);
    const found = await this.driveFetch<{ files?: { id: string }[] }>(
      `${DRIVE}/files?q=${q}&fields=files(id,name,modifiedTime)`,
      { headers },
    );
    return found.files?.[0] || null;
  }

  private async uploadJsonFile(clientId: string, parentId: string, name: string, object: unknown): Promise<void> {
    const existing = await this.findFileInFolder(clientId, parentId, name);
    const metadata = { name, parents: existing ? undefined : [parentId] };
    const boundary = 'vaultsync';
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(existing ? { name } : metadata)}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      `${JSON.stringify(object)}\r\n` +
      `--${boundary}--`;

    const token = await this.google.ensureAccessToken(clientId);
    const url = existing
      ? `${UPLOAD}/files/${existing.id}?uploadType=multipart`
      : `${UPLOAD}/files?uploadType=multipart`;
    const method = existing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  }

  private async downloadJsonFile<T>(clientId: string, parentId: string, name: string): Promise<T | null> {
    const file = await this.findFileInFolder(clientId, parentId, name);
    if (!file) return null;
    const headers = await this.authHeaders(clientId, false);
    const text = await this.driveFetch<string>(`${DRIVE}/files/${file.id}?alt=media`, { headers });
    return typeof text === 'string' ? (JSON.parse(text) as T) : (text as T);
  }
}
