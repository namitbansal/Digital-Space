import { Injectable } from '@angular/core';
import { EncryptedAttachmentRecord } from '../models/vault.models';
import { normalizeUsername } from '../utils/username';

const DB_VERSION = 1;
const LEGACY_DB_NAME = 'vault';

@Injectable({ providedIn: 'root' })
export class DbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private scopeUsername: string | null = null;

  setUserScope(username: string | null): void {
    const next = username ? normalizeUsername(username) : null;
    if (this.scopeUsername === next) return;
    this.scopeUsername = next;
    this.dbPromise = null;
  }

  getUserScope(): string | null {
    return this.scopeUsername;
  }

  private dbName(): string {
    return this.scopeUsername ? `vault-${this.scopeUsername}` : LEGACY_DB_NAME;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    const name = this.dbName();
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('attachments')) {
          db.createObjectStore('attachments', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  async kvGet<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result?.value as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ key, value });
    await this.txDone(tx);
  }

  async attachmentPut(record: unknown): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').put(record);
    await this.txDone(tx);
  }

  async attachmentDelete(id: string): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').delete(id);
    await this.txDone(tx);
  }

  async attachmentListAll(): Promise<EncryptedAttachmentRecord[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readonly');
      const req = tx.objectStore('attachments').getAll();
      req.onsuccess = () => resolve((req.result || []) as EncryptedAttachmentRecord[]);
      req.onerror = () => reject(req.error);
    });
  }
}
