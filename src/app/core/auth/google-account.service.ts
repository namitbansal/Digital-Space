import { Injectable, Injector, inject } from '@angular/core';
import { VaultSyncAccount } from '../models/vault.models';
import { VaultService } from '../services/vault.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { LoggerService } from '../services/logger.service';

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleTokenError = {
  type?: string;
  message?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: GoogleTokenError) => void;
            use_fedcm_for_prompt?: boolean;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file';

@Injectable({ providedIn: 'root' })
export class GoogleAccountService {
  private readonly log = inject(LoggerService);
  private readonly injector = inject(Injector);
  private readonly oauthConfig = inject(GoogleOAuthConfigService);

  private scriptPromise: Promise<void> | null = null;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  private vaultService(): VaultService {
    return this.injector.get(VaultService);
  }

  getAccount(): VaultSyncAccount {
    return this.vaultService().getSyncAccount();
  }

  getAccessToken(): string | null {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) return this.accessToken;
    return null;
  }

  clearAuth(): void {
    this.log.enter('clearAuth');
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.log.exit('clearAuth');
  }

  setAccessToken(accessToken: string, expiresIn = 3600): void {
    this.log.enter('setAccessToken', { expiresIn });
    this.accessToken = accessToken;
    this.tokenExpiry = Date.now() + expiresIn * 1000;
    this.log.exit('setAccessToken');
  }

  async finishConnectAfterToken(
    resolvedClientId: string,
    options?: { persist?: boolean },
  ): Promise<{ email: string; id: string }> {
    this.log.enter('finishConnectAfterToken', { persist: options?.persist });
    if (!this.accessToken) {
      this.log.error('finishConnectAfterToken: NO_ACCESS_TOKEN');
      const err = new Error('NO_ACCESS_TOKEN') as Error & { code?: string };
      err.code = 'NO_ACCESS_TOKEN';
      throw err;
    }
    const result = await this.finishConnect(resolvedClientId, options);
    this.log.exit('finishConnectAfterToken', result);
    return result;
  }

  /** Load Google Identity Services for token refresh (sync / Drive API). */
  async prepareSignIn(clientId: string): Promise<void> {
    this.log.enter('prepareSignIn');
    if (!clientId.trim()) {
      this.log.error('prepareSignIn: NO_CLIENT_ID');
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }
    await this.loadScript();
    this.log.exit('prepareSignIn');
  }

  async ensureAccessToken(clientId?: string): Promise<string> {
    this.log.enter('ensureAccessToken');
    const existing = this.getAccessToken();
    if (existing) {
      this.log.exit('ensureAccessToken', { reused: true });
      return existing;
    }
    const resolvedClientId = await this.resolveClientId(clientId);
    await this.prepareSignIn(resolvedClientId);
    const token = await this.requestAccessToken(resolvedClientId, '');
    this.log.exit('ensureAccessToken', { reused: false });
    return token;
  }

  async disconnect(): Promise<void> {
    this.log.enter('disconnect');
    this.clearAuth();
    await this.vaultService().clearGoogleAccount();
    this.log.exit('disconnect');
  }

  private async finishConnect(
    resolvedClientId: string,
    options?: { persist?: boolean },
  ): Promise<{ email: string; id: string }> {
    this.log.enter('finishConnect', { persist: options?.persist });
    const profile = await this.fetchUserInfo(this.accessToken!);
    this.log.step('Fetched Google user profile', { email: profile.email, sub: profile.sub });

    if (options?.persist !== false) {
      this.log.step('Persisting Google account on vault sync record');
      await this.vaultService().updateSyncAccount({
        googleClientId: resolvedClientId,
        googleAccountEmail: profile.email,
        googleAccountId: profile.sub,
      });
    }

    const result = { email: profile.email, id: profile.sub };
    this.log.exit('finishConnect', result);
    return result;
  }

  private async resolveClientId(clientId?: string): Promise<string> {
    this.log.enter('resolveClientId');
    const sync = this.vaultService().getSyncAccount();
    const resolvedClientId = await this.oauthConfig.resolve(clientId || sync.googleClientId);
    if (!resolvedClientId) {
      this.log.error('resolveClientId: NO_CLIENT_ID');
      const err = new Error('NO_CLIENT_ID') as Error & { code?: string };
      err.code = 'NO_CLIENT_ID';
      throw err;
    }
    this.log.exit('resolveClientId', { hasClientId: true });
    return resolvedClientId;
  }

  private loadScript(): Promise<void> {
    this.log.enter('loadScript');
    if (window.google?.accounts?.oauth2) {
      this.log.exit('loadScript', { alreadyLoaded: true });
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      this.log.step('Reusing in-flight GIS script load');
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve, reject) => {
      const finish = () => {
        if (window.google?.accounts?.oauth2) {
          this.log.step('GIS script ready');
          resolve();
        } else {
          this.log.error('GIS script loaded but oauth2 unavailable');
          reject(new Error('GIS_UNAVAILABLE'));
        }
      };

      const existing = document.querySelector(`script[src="${GIS_SCRIPT}"]`) as HTMLScriptElement | null;
      if (existing) {
        this.log.step('GIS script tag already present');
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }
        if (existing.dataset['gisLoaded'] === 'true') {
          finish();
          return;
        }
        existing.addEventListener(
          'load',
          () => {
            existing.dataset['gisLoaded'] = 'true';
            finish();
          },
          { once: true },
        );
        existing.addEventListener('error', () => reject(new Error('GIS_LOAD_FAILED')), { once: true });
        return;
      }

      this.log.step('Injecting GIS script tag');
      const script = document.createElement('script');
      script.src = GIS_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset['gisLoaded'] = 'true';
        finish();
      };
      script.onerror = () => reject(new Error('GIS_LOAD_FAILED'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }

  private requestAccessToken(clientId: string, prompt: string): Promise<string> {
    this.log.enter('requestAccessToken', { prompt: prompt || '(none)' });
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        this.log.error('requestAccessToken: GIS_UNAVAILABLE');
        const err = new Error('GIS_UNAVAILABLE') as Error & { code?: string };
        err.code = 'GIS_UNAVAILABLE';
        reject(err);
        return;
      }

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn();
      };

      const timeoutId = window.setTimeout(() => {
        finish(() => {
          this.log.error('requestAccessToken: AUTH_TIMEOUT');
          const err = new Error('Google sign-in timed out.') as Error & { code?: string };
          err.code = 'AUTH_TIMEOUT';
          reject(err);
        });
      }, 90_000);

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        use_fedcm_for_prompt: false,
        callback: (response) => {
          if (response.error || !response.access_token) {
            finish(() => {
              const code = mapGoogleAuthError(response.error);
              this.log.error('GIS token callback error', { code, response });
              const err = new Error(response.error_description || response.error || 'GOOGLE_AUTH_FAILED') as Error & {
                code?: string;
              };
              err.code = code;
              reject(err);
            });
            return;
          }
          finish(() => {
            this.accessToken = response.access_token!;
            const expiresIn = Number(response.expires_in || 3600);
            this.tokenExpiry = Date.now() + expiresIn * 1000;
            this.log.exit('requestAccessToken', { expiresIn });
            resolve(response.access_token!);
          });
        },
        error_callback: (error) => {
          finish(() => {
            const code = mapGoogleAuthError(error.type, error.message);
            this.log.error('GIS token error_callback', { code, error });
            const err = new Error(error.message || error.type || 'GOOGLE_AUTH_FAILED') as Error & { code?: string };
            err.code = code;
            reject(err);
          });
        },
      });

      this.log.step('Requesting GIS access token');
      client.requestAccessToken(prompt ? { prompt } : {});
    });
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    this.log.enter('fetchUserInfo');
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      this.log.error('fetchUserInfo failed', { status: res.status });
      const err = new Error('GOOGLE_PROFILE_FAILED') as Error & { code?: string };
      err.code = 'GOOGLE_PROFILE_FAILED';
      throw err;
    }
    const profile = (await res.json()) as GoogleUserInfo;
    this.log.exit('fetchUserInfo', { email: profile.email, sub: profile.sub });
    return profile;
  }
}

function mapGoogleAuthError(type?: string, message?: string): string {
  const raw = String(type || message || '').toLowerCase();
  if (raw.includes('popup_closed') || raw === 'popup_closed') return 'POPUP_CLOSED';
  if (raw.includes('popup_failed')) return 'POPUP_FAILED_TO_OPEN';
  if (raw.includes('access_denied')) return 'ACCESS_DENIED';
  if (raw.includes('origin') || raw.includes('redirect_uri')) return 'ORIGIN_MISMATCH';
  if (raw.includes('invalid_client')) return 'INVALID_CLIENT';
  return (type || 'GOOGLE_AUTH_FAILED').toUpperCase();
}
