import { Injectable, inject } from '@angular/core';
import { VaultEnvelope } from '../models/vault.models';
import { DbService } from './db.service';
import { normalizeUsername } from '../utils/username';

const ENVELOPE_KEY = 'vaultEnvelope';
const HAS_VAULT_KEY = 'hasVault';

@Injectable({ providedIn: 'root' })
export class VaultStoreService {
  private readonly db = inject(DbService);

  setUserScope(username: string | null): void {
    this.db.setUserScope(username ? normalizeUsername(username) : null);
  }

  async hasVaultInScope(): Promise<boolean> {
    const flag = await this.db.kvGet(HAS_VAULT_KEY);
    if (flag) return true;
    const env = await this.db.kvGet(ENVELOPE_KEY);
    return Boolean(env);
  }

  async hasLegacyVault(): Promise<boolean> {
    const prev = this.db.getUserScope();
    this.db.setUserScope(null);
    const exists = await this.hasVaultInScope();
    this.db.setUserScope(prev);
    return exists;
  }

  async hasVault(username: string): Promise<boolean> {
    const prev = this.db.getUserScope();
    this.db.setUserScope(username);
    const exists = await this.hasVaultInScope();
    this.db.setUserScope(prev);
    return exists;
  }

  async loadEnvelope(): Promise<VaultEnvelope | undefined> {
    return this.db.kvGet<VaultEnvelope>(ENVELOPE_KEY);
  }

  async saveEnvelope(envelope: VaultEnvelope): Promise<void> {
    await this.db.kvSet(ENVELOPE_KEY, envelope);
    await this.db.kvSet(HAS_VAULT_KEY, true);
  }

  async migrateLegacyToUser(username: string): Promise<boolean> {
    const normalized = normalizeUsername(username);
    const prev = this.db.getUserScope();

    this.db.setUserScope(null);
    const legacyEnvelope = await this.loadEnvelope();
    const legacyHas = await this.hasVaultInScope();
    this.db.setUserScope(normalized);

    if (!legacyHas || !legacyEnvelope) {
      this.db.setUserScope(prev);
      return false;
    }

    const userHas = await this.hasVaultInScope();
    if (!userHas) {
      await this.saveEnvelope(legacyEnvelope);
      const bundle = await this.db.kvGet('vaultRecoveryBundle');
      if (bundle) await this.db.kvSet('vaultRecoveryBundle', bundle);
      const settings = await this.db.kvGet('settings');
      if (settings) await this.db.kvSet('settings', settings);
    }

    this.db.setUserScope(prev);
    return true;
  }
}
