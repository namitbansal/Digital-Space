import { Injectable, inject } from '@angular/core';
import { DEFAULT_GOOGLE_CLIENT_ID } from '../constants/google-oauth.config';
import { LoggerService } from '../services/logger.service';

const RUNTIME_CONFIG_URL = 'config/google-oauth.json';

@Injectable({ providedIn: 'root' })
export class GoogleOAuthConfigService {
  private readonly log = inject(LoggerService);
  private runtimeClientId: string | null = null;
  private loadPromise: Promise<string> | null = null;

  /** Warm cache so connect buttons work immediately. */
  preload(): Promise<string> {
    this.log.enter('preload');
    return this.resolve();
  }

  hasClientId(preferred?: string | null): boolean {
    if (String(preferred || '').trim()) return true;
    if (DEFAULT_GOOGLE_CLIENT_ID.trim()) return true;
    if (this.runtimeClientId?.trim()) return true;
    return false;
  }

  async resolve(preferred?: string | null): Promise<string> {
    this.log.enter('resolve', { hasPreferred: Boolean(String(preferred || '').trim()) });
    const explicit = String(preferred || '').trim();
    if (explicit) {
      this.log.exit('resolve', { source: 'preferred' });
      return explicit;
    }

    const builtIn = DEFAULT_GOOGLE_CLIENT_ID.trim();
    if (builtIn) {
      this.log.exit('resolve', { source: 'built-in' });
      return builtIn;
    }

    if (this.runtimeClientId?.trim()) {
      this.log.exit('resolve', { source: 'runtime-cache' });
      return this.runtimeClientId.trim();
    }

    const runtime = await this.loadRuntimeConfig();
    this.log.exit('resolve', { source: 'runtime-fetch', hasClientId: Boolean(runtime) });
    return runtime;
  }

  /** Re-read config/google-oauth.json (e.g. after owner adds the file). */
  async refresh(): Promise<string> {
    this.log.enter('refresh');
    this.loadPromise = null;
    this.runtimeClientId = null;
    const clientId = await this.loadRuntimeConfig();
    this.log.exit('refresh', { hasClientId: Boolean(clientId) });
    return clientId;
  }

  private loadRuntimeConfig(): Promise<string> {
    this.log.enter('loadRuntimeConfig');
    if (!this.loadPromise) {
      this.loadPromise = this.fetchRuntimeConfig();
    }
    return this.loadPromise;
  }

  private async fetchRuntimeConfig(): Promise<string> {
    this.log.enter('fetchRuntimeConfig', { url: RUNTIME_CONFIG_URL });
    try {
      const res = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' });
      if (!res.ok) {
        this.log.warn('fetchRuntimeConfig: config file not found', { status: res.status });
        this.log.exit('fetchRuntimeConfig', { clientId: '' });
        return '';
      }
      const data = (await res.json()) as { clientId?: string };
      const id = String(data.clientId || '').trim();
      this.runtimeClientId = id || null;
      this.log.exit('fetchRuntimeConfig', { hasClientId: Boolean(id) });
      return id;
    } catch (e) {
      this.log.error('fetchRuntimeConfig failed', e);
      this.log.exit('fetchRuntimeConfig', { clientId: '' });
      return '';
    }
  }
}
