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
  AppLogger.enter('getGoogleOAuthRedirectUri');
  if (typeof window === 'undefined') {
    AppLogger.exit('getGoogleOAuthRedirectUri', { redirectUri: 'http://localhost:5173/' });
    return 'http://localhost:5173/';
  }
  const origin = window.location.origin;
  const base = document.querySelector('base')?.getAttribute('href') || '/';
  if (!base || base === '/') {
    const redirectUri = origin + '/';
    AppLogger.exit('getGoogleOAuthRedirectUri', { redirectUri });
    return redirectUri;
  }
  const path = base.startsWith('/') ? base : '/' + base;
  const redirectUri = origin + (path.endsWith('/') ? path : path + '/');
  AppLogger.exit('getGoogleOAuthRedirectUri', { redirectUri });
  return redirectUri;
}

export function createOAuthState(): string {
  AppLogger.enter('createOAuthState');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  AppLogger.exit('createOAuthState', { stateLength: state.length });
  return state;
}

export function loadPendingGoogleOAuth(): GoogleOAuthPendingRedirect | null {
  AppLogger.enter('loadPendingGoogleOAuth');
  try {
    const raw = sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY);
    if (!raw) {
      AppLogger.step('No pending OAuth state in sessionStorage');
      AppLogger.exit('loadPendingGoogleOAuth', null);
      return null;
    }
    const pending = JSON.parse(raw) as GoogleOAuthPendingRedirect;
    AppLogger.exit('loadPendingGoogleOAuth', {
      flow: pending.flow,
      hasToken: Boolean(pending.accessToken),
      hasError: Boolean(pending.oauthError),
    });
    return pending;
  } catch (e) {
    AppLogger.error('Failed to parse pending OAuth state', e);
    AppLogger.exit('loadPendingGoogleOAuth', null);
    return null;
  }
}

export function savePendingGoogleOAuth(pending: GoogleOAuthPendingRedirect): void {
  AppLogger.enter('savePendingGoogleOAuth', {
    flow: pending.flow,
    hasToken: Boolean(pending.accessToken),
    hasError: Boolean(pending.oauthError),
  });
  sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, JSON.stringify(pending));
  AppLogger.exit('savePendingGoogleOAuth');
}

export function clearPendingGoogleOAuth(): void {
  AppLogger.enter('clearPendingGoogleOAuth');
  sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
  AppLogger.exit('clearPendingGoogleOAuth');
}

export function hasPendingGoogleOAuthWithToken(): boolean {
  AppLogger.enter('hasPendingGoogleOAuthWithToken');
  const pending = loadPendingGoogleOAuth();
  const result = Boolean(pending?.accessToken && !pending.oauthError);
  AppLogger.exit('hasPendingGoogleOAuthWithToken', { result });
  return result;
}

export function buildGoogleImplicitAuthUrl(clientId: string, state: string, selectAccount: boolean): string {
  AppLogger.enter('buildGoogleImplicitAuthUrl', { selectAccount, stateLength: state.length });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleOAuthRedirectUri(),
    response_type: 'token',
    scope: GOOGLE_OAUTH_SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  if (selectAccount) params.set('prompt', 'select_account');
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  AppLogger.exit('buildGoogleImplicitAuthUrl', { redirectUri: params.get('redirect_uri') });
  return url;
}

/** Call once on page load — captures #access_token from same-tab OAuth redirect. */
export function captureGoogleOAuthRedirectFromUrl(): void {
  AppLogger.enter('captureGoogleOAuthRedirectFromUrl');
  const hash = window.location.hash;
  if (!hash || hash.length < 2) {
    AppLogger.step('No OAuth hash in URL');
    AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: false });
    return;
  }

  const params = new URLSearchParams(hash.slice(1));
  const state = params.get('state');
  if (!state) {
    AppLogger.step('Hash present but no state parameter');
    AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: false });
    return;
  }

  const pending = loadPendingGoogleOAuth();
  if (!pending || pending.state !== state) {
    AppLogger.warn('OAuth state mismatch or missing pending record', {
      hasPending: Boolean(pending),
      stateMatch: pending?.state === state,
    });
    AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: false });
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
    AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: false, oauthError: pending.oauthError });
    return;
  }

  const accessToken = params.get('access_token');
  if (!accessToken) {
    AppLogger.step('OAuth hash has state but no access_token yet');
    AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: false });
    return;
  }

  pending.accessToken = accessToken;
  pending.expiresIn = Number(params.get('expires_in') || 3600);
  AppLogger.step('Captured access token from redirect', {
    flow: pending.flow,
    expiresIn: pending.expiresIn,
  });
  savePendingGoogleOAuth(pending);
  stripOAuthHashFromUrl();
  AppLogger.exit('captureGoogleOAuthRedirectFromUrl', { captured: true, flow: pending.flow });
}

function stripOAuthHashFromUrl(): void {
  AppLogger.enter('stripOAuthHashFromUrl');
  const path = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', path);
  AppLogger.exit('stripOAuthHashFromUrl', { path });
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
  AppLogger.enter('startGoogleOAuthRedirect', {
    flow: input.flow,
    verifyDrive: input.verifyDrive,
    persist: input.persist,
    selectAccount: input.selectAccount,
    openSettings: input.openSettings,
    username: input.username,
  });
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
  const authUrl = buildGoogleImplicitAuthUrl(input.clientId, state, input.selectAccount);
  AppLogger.step('Redirecting browser to Google OAuth', { redirectUri: getGoogleOAuthRedirectUri() });
  window.location.assign(authUrl);
}

export function stashGoogleOAuthUiMessage(success?: string, error?: string): void {
  AppLogger.enter('stashGoogleOAuthUiMessage', { hasSuccess: Boolean(success), hasError: Boolean(error) });
  if (!success && !error) {
    AppLogger.exit('stashGoogleOAuthUiMessage', { stashed: false });
    return;
  }
  sessionStorage.setItem(GOOGLE_OAUTH_UI_KEY, JSON.stringify({ success: success || '', error: error || '' }));
  AppLogger.exit('stashGoogleOAuthUiMessage', { stashed: true });
}

export function consumeGoogleOAuthUiMessage(): { success: string; error: string } | null {
  AppLogger.enter('consumeGoogleOAuthUiMessage');
  try {
    const raw = sessionStorage.getItem(GOOGLE_OAUTH_UI_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_UI_KEY);
    if (!raw) {
      AppLogger.exit('consumeGoogleOAuthUiMessage', null);
      return null;
    }
    const parsed = JSON.parse(raw) as { success?: string; error?: string };
    const message = { success: parsed.success || '', error: parsed.error || '' };
    AppLogger.exit('consumeGoogleOAuthUiMessage', message);
    return message;
  } catch (e) {
    AppLogger.error('Failed to consume OAuth UI message', e);
    sessionStorage.removeItem(GOOGLE_OAUTH_UI_KEY);
    AppLogger.exit('consumeGoogleOAuthUiMessage', null);
    return null;
  }
}
