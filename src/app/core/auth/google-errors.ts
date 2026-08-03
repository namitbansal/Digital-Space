/** Current page origin — must match a Google OAuth "Authorized JavaScript origin" exactly. */
import { getGoogleOAuthRedirectUri } from './google-oauth-redirect.util';
import { AppLogger } from '../services/logger.util';

export function getOAuthOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost:5173';
  return window.location.origin;
}

/** User-facing messages for Google sign-in and Drive verification failures. */
export function googleErrorMessage(error: unknown, fallback = 'Could not connect Google. Try again.'): string {
  AppLogger.enter('googleErrorMessage');
  const code = (error as Error & { code?: string })?.code;
  const message = String((error as Error)?.message || '');
  const origin = getOAuthOrigin();
  AppLogger.step('Mapping Google error', { code, message });

  const finish = (result: string): string => {
    AppLogger.exit('googleErrorMessage', { code, result });
    return result;
  };

  switch (code) {
    case 'NO_CLIENT_ID':
      return finish('Google sign-in is not configured yet. Paste your OAuth Client ID below and save it first.');
    case 'POPUP_CLOSED':
    case 'POPUP_FAILED_TO_OPEN':
      return finish(
        'Google sign-in was blocked or closed. Allow popups for this site in Chrome, or use Connect Google again ' +
          '(the app opens Google in the same tab).',
      );
    case 'ACCESS_DENIED':
      return finish('Google access was denied. Allow the requested permissions to link your account.');
    case 'ORIGIN_MISMATCH':
      return finish(
        `Google OAuth is not configured for ${origin}. In Google Cloud Console add this exact origin under ` +
          'Authorized JavaScript origins, and add ' +
          getGoogleOAuthRedirectUri() +
          ' under Authorized redirect URIs, then try again.',
      );
    case 'INVALID_CLIENT':
      return finish('Invalid OAuth Client ID. Check that you copied the full Web client ID from Google Cloud Console.');
    case 'GIS_UNAVAILABLE':
    case 'GIS_LOAD_FAILED':
      return finish('Could not load Google sign-in. Check your internet connection, disable ad blockers, and try again.');
    case 'AUTH_TIMEOUT':
      return finish(
        'Google sign-in did not finish (stuck on accounts.google.com). Close that tab, use Chrome or Edge at ' +
          `${origin}, allow popups for this site, disable ad blockers, then try Connect again.`,
      );
    case 'GOOGLE_PROFILE_FAILED':
      return finish('Signed in with Google but could not read your profile. Try again.');
    case 'DRIVE_VERIFY_FAILED':
      return finish(
        message ||
          'Google account connected, but Drive verification failed. Enable the Google Drive API in Cloud Console and try again.',
      );
    default:
      break;
  }

  const lower = message.toLowerCase();
  if (lower.includes('origin') || lower.includes('redirect_uri')) {
    return finish(`OAuth origin mismatch. Add ${origin} to Authorized JavaScript origins in Google Cloud Console.`);
  }
  if (message.includes('Drive API')) {
    return finish('Drive access failed. Enable the Google Drive API for your OAuth project and try again.');
  }

  return finish(message || fallback);
}
