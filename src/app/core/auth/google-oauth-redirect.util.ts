import { AppLogger } from '../services/logger.util';

export const GOOGLE_OAUTH_PENDING_KEY = 'digital-space-google-oauth-pending';
export const GOOGLE_OAUTH_UI_KEY = 'digital-space-google-oauth-ui';

export const GOOGLE_OAUTH_SCOPE =
  'openid email profile https://www.googleapis.com/auth/drive.file';

export type GoogleOAuthPendingFlow = 'account-identity' | 'account-drive' | 'create-vault';

export interface GoogleOAuthPendingRedirect {
  state: string;
  clientId: string;
  username?: string;
  verifyDrive: boolean;
  persist: boolean;
  selectAccount: boolean;
  flow: GoogleOAuthPendingFlow;
  openSettings?: boolean;
  accessToken?: string;
  expiresIn?: number;
  oauthError?: string;
  createdAt: number;
}

export function getGoogleOAuthRedirectUri(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:5173/';
  }
  const origin = window.location.origin;
  const base = document.querySelector('base')?.getAttribute('href') || '/';
  if (!base || base === '/') {
    return origin + '/';
  }
  const path = base.startsWith('/') ? base : '/' + base;
  return origin + (path.endsWith('/') ? path : path + '/');
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadPendingGoogleOAuth(): GoogleOAuthPendingRedirect | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleOAuthPendingRedirect;
  } catch (e) {
    AppLogger.error('Failed to parse pending OAuth state', e);
    return null;
  }
}

export function savePendingGoogleOAuth(pending: GoogleOAuthPendingRedirect): void {
  sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, JSON.stringify(pending));
}

export function clearPendingGoogleOAuth(): void {
  sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
}

export function hasPendingGoogleOAuthWithToken(): boolean {
  const pending = loadPendingGoogleOAuth();
  return Boolean(pending?.accessToken && !pending.oauthError);
}

export function buildGoogleImplicitAuthUrl(clientId: string, state: string, selectAccount: boolean): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleOAuthRedirectUri(),
    response_type: 'token',
    scope: GOOGLE_OAUTH_SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  if (selectAccount) params.set('prompt', 'select_account');
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

/** Call once on page load — captures #access_token from same-tab OAuth redirect. */
export function captureGoogleOAuthRedirectFromUrl(): void {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;

  const params = new URLSearchParams(hash.slice(1));
  const state = params.get('state');
  if (!state) return;

  const pending = loadPendingGoogleOAuth();
  if (!pending || pending.state !== state) {
    AppLogger.warn('OAuth state mismatch or missing pending record', {
      hasPending: Boolean(pending),
      stateMatch: pending?.state === state,
    });
    return;
  }

  const error = params.get('error');
  if (error) {
    pending.oauthError = params.get('error_description') || error;
    AppLogger.error('Google OAuth returned error in redirect hash', {
      error,
      description: pending.oauthError,
    });
    savePendingGoogleOAuth(pending);
    stripOAuthHashFromUrl();
    return;
  }

  const accessToken = params.get('access_token');
  if (!accessToken) return;

  pending.accessToken = accessToken;
  pending.expiresIn = Number(params.get('expires_in') || 3600);
  AppLogger.info('Google OAuth token captured', { flow: pending.flow });
  savePendingGoogleOAuth(pending);
  stripOAuthHashFromUrl();
}

function stripOAuthHashFromUrl(): void {
  const path = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', path);
}

export function startGoogleOAuthRedirect(input: {
  clientId: string;
  username?: string;
  verifyDrive: boolean;
  persist: boolean;
  selectAccount: boolean;
  flow: GoogleOAuthPendingFlow;
  openSettings?: boolean;
}): void {
  const state = createOAuthState();
  savePendingGoogleOAuth({
    state,
    clientId: input.clientId.trim(),
    username: input.username,
    verifyDrive: input.verifyDrive,
    persist: input.persist,
    selectAccount: input.selectAccount,
    flow: input.flow,
    openSettings: input.openSettings,
    createdAt: Date.now(),
  });
  window.location.assign(buildGoogleImplicitAuthUrl(input.clientId, state, input.selectAccount));
}

export function stashGoogleOAuthUiMessage(success?: string, error?: string): void {
  if (!success && !error) return;
  sessionStorage.setItem(GOOGLE_OAUTH_UI_KEY, JSON.stringify({ success: success || '', error: error || '' }));
}

export function consumeGoogleOAuthUiMessage(): { success: string; error: string } | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_OAUTH_UI_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_UI_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { success?: string; error?: string };
    return { success: parsed.success || '', error: parsed.error || '' };
  } catch (e) {
    AppLogger.error('Failed to consume OAuth UI message', e);
    sessionStorage.removeItem(GOOGLE_OAUTH_UI_KEY);
    return null;
  }
}

// --- Create-vault wizard state (survives OAuth redirect) ---

export const CREATE_VAULT_DRAFT_KEY = 'digital-space-create-vault-draft';

export type CreateVaultDraftStorageChoice = 'device' | 'google';

export interface CreateVaultDraft {
  loginUsername: string;
  userName: string;
  recoveryCode: string;
  storageChoice: CreateVaultDraftStorageChoice;
  syncToDrive: boolean;
  createdAt: number;
}

export function saveCreateVaultDraft(draft: Omit<CreateVaultDraft, 'createdAt'>): void {
  sessionStorage.setItem(
    CREATE_VAULT_DRAFT_KEY,
    JSON.stringify({ ...draft, createdAt: Date.now() } satisfies CreateVaultDraft),
  );
}

export function loadCreateVaultDraft(): CreateVaultDraft | null {
  try {
    const raw = sessionStorage.getItem(CREATE_VAULT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CreateVaultDraft;
    return draft.loginUsername && draft.recoveryCode ? draft : null;
  } catch (e) {
    AppLogger.error('Failed to parse create-vault draft', e);
    return null;
  }
}

export function clearCreateVaultDraft(): void {
  sessionStorage.removeItem(CREATE_VAULT_DRAFT_KEY);
}
