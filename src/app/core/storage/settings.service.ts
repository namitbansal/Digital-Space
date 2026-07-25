import { Injectable, inject } from '@angular/core';
import { AppSettings } from '../models/vault.models';
import { DbService } from './db.service';

const KEY = 'settings';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  vaultRevision: 0,
  installedAt: null,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly db = inject(DbService);

  async load(): Promise<AppSettings> {
    const saved = await this.db.kvGet<Partial<AppSettings>>(KEY);
    return { ...DEFAULT_SETTINGS, ...(saved || {}) };
  }

  async save(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.load();
    const next = { ...current, ...partial };
    await this.db.kvSet(KEY, next);
    return next;
  }

  async replace(next: AppSettings): Promise<void> {
    await this.db.kvSet(KEY, next);
  }
}
