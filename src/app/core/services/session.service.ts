import { Injectable } from '@angular/core';
import { wipeObjectStrings } from '../crypto/wipe';
import { VaultData, VaultEnvelope } from '../models/vault.models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  unlocked = false;
  key: CryptoKey | null = null;
  vault: VaultData | null = null;
  envelope: VaultEnvelope | null = null;

  setSession(input: { key: CryptoKey; vault: VaultData; envelope: VaultEnvelope }): void {
    this.unlocked = true;
    this.key = input.key;
    this.vault = input.vault;
    this.envelope = input.envelope;
  }

  clear(): void {
    if (this.vault) wipeObjectStrings(this.vault);
    this.unlocked = false;
    this.key = null;
    this.vault = null;
    this.envelope = null;
  }

  isUnlocked(): boolean {
    return this.unlocked && Boolean(this.key) && Boolean(this.vault);
  }
}
