import { Injectable } from '@angular/core';
import { DEFAULT_GOOGLE_CLIENT_ID } from '../constants/google-oauth.config';

const RUNTIME_CONFIG_URL = 'config/google-oauth.json';

@Injectable({ providedIn: 'root' })
export class GoogleOAuthConfigService {
  private runtimeClientId: string | null = null;
  private loadPromise: Promise<string> | null = null;

  /** Warm cache so connect buttons work immediately. */
  preload(): Promise<string> {
    return this.resolve();
  }

  hasClientId(preferred?: string | null): boolean {
    if (String(preferred || '').trim()) return true;
    if (DEFAULT_GOOGLE_CLIENT_ID.trim()) return true;
    if (this.runtimeClientId?.trim()) return true;
    return false;
  }

  async resolve(preferred?: string | null): Promise<string> {
    const explicit = String(preferred || '').trim();
    if (explicit) return explicit;

    const builtIn = DEFAULT_GOOGLE_CLIENT_ID.trim();
    if (builtIn) return builtIn;

    if (this.runtimeClientId?.trim()) return this.runtimeClientId.trim();

    return this.loadRuntimeConfig();
  }

  /** Re-read config/google-oauth.json (e.g. after owner adds the file). */
  async refresh(): Promise<string> {
    this.loadPromise = null;
    this.runtimeClientId = null;
    return this.loadRuntimeConfig();
  }

  private loadRuntimeConfig(): Promise<string> {
    if (!this.loadPromise) {
      this.loadPromise = this.fetchRuntimeConfig();
    }
    return this.loadPromise;
  }

  private async fetchRuntimeConfig(): Promise<string> {
    try {
      const res = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' });
      if (!res.ok) return '';
      const data = (await res.json()) as { clientId?: string };
      const id = String(data.clientId || '').trim();
      this.runtimeClientId = id || null;
      return id;
    } catch {
      return '';
    }
  }
}
