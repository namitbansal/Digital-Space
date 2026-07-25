import { Injectable, inject } from '@angular/core';
import { encryptBytes } from '../crypto/aes';
import { AttachmentMeta, EncryptedAttachmentRecord } from '../models/vault.models';
import { DbService } from '../storage/db.service';
import { createId, nowIso } from '../utils/id';
import { VaultService } from './vault.service';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly db = inject(DbService);
  private readonly session = inject(SessionService);
  private readonly vault = inject(VaultService);

  async save(file: File): Promise<AttachmentMeta> {
    if (!this.session.isUnlocked() || !this.session.key) throw new Error('LOCKED');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { iv, ciphertext } = await encryptBytes(this.session.key, bytes);
    const id = createId('att');
    const mimeType = file.type || this.guessMime(file.name);
    const meta: AttachmentMeta = {
      id,
      fileName: file.name || 'file',
      mimeType,
      size: bytes.byteLength,
      createdAt: nowIso(),
    };
    const record: EncryptedAttachmentRecord = { id, iv, ciphertext };
    await this.db.attachmentPut(record);
    return meta;
  }

  async remove(id: string): Promise<void> {
    this.vault.assertAttachmentInActiveProfile(id);
    await this.db.attachmentDelete(id);
  }

  formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  private guessMime(fileName = ''): string {
    const n = fileName.toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
  }
}
