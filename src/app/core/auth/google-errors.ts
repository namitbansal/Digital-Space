/** Current page origin — must match a Google OAuth "Authorized JavaScript origin" exactly. */
import { getGoogleOAuthRedirectUri } from './google-oauth-redirect.util';

export function getOAuthOrigin(): string {
  if (typeof window === 'undefined') return 'http://localhost:5173';
  return window.location.origin;
}

/** User-facing messages for Google sign-in and Drive verification failures. */
export function googleErrorMessage(error: unknown, fallback = 'Could not connect Google. Try again.'): string {
  const code = (error as Error & { code?: string })?.code;
  const message = String((error as Error)?.message || '');
  const origin = getOAuthOrigin();

  switch (code) {
    case 'NO_CLIENT_ID':
      return 'Google sign-in is not configured yet. Paste your OAuth Client ID below and save it first.';
    case 'POPUP_CLOSED':
    case 'POPUP_FAILED_TO_OPEN':
      return (
        'Google sign-in was blocked or closed. Allow popups for this site in Chrome, or use Connect Google again ' +
        '(the app opens Google in the same tab).'
      );
    case 'ACCESS_DENIED':
      return 'Google access was denied. Allow the requested permissions to link your account.';
    case 'ORIGIN_MISMATCH':
      return (
        `Google OAuth is not configured for ${origin}. In Google Cloud Console add this exact origin under ` +
        'Authorized JavaScript origins, and add ' +
        getGoogleOAuthRedirectUri() +
        ' under Authorized redirect URIs, then try again.'
      );
    case 'INVALID_CLIENT':
      return 'Invalid OAuth Client ID. Check that you copied the full Web client ID from Google Cloud Console.';
    case 'GIS_UNAVAILABLE':
    case 'GIS_LOAD_FAILED':
      return 'Could not load Google sign-in. Check your internet connection, disable ad blockers, and try again.';
    case 'AUTH_TIMEOUT':
      return (
        'Google sign-in did not finish (stuck on accounts.google.com). Close that tab, use Chrome or Edge at ' +
        `${origin}, allow popups for this site, disable ad blockers, then try Connect again.`
      );
    case 'GOOGLE_PROFILE_FAILED':
      return 'Signed in with Google but could not read your profile. Try again.';
    case 'DRIVE_VERIFY_FAILED':
      return (
        message ||
        'Google account connected, but Drive verification failed. Enable the Google Drive API in Cloud Console and try again.'
      );
    default:
      break;
  }

  const lower = message.toLowerCase();
  if (lower.includes('redirect_uri_mismatch') || lower.includes('redirect_uri')) {
    return (
      `Google OAuth redirect URI mismatch. In Google Cloud Console → Credentials → your Web client, add ` +
      `Authorized JavaScript origin: ${origin} and Authorized redirect URI: ${getGoogleOAuthRedirectUri()} ` +
      '(exact match, including trailing slash).'
    );
  }
  if (lower.includes('origin')) {
    return `OAuth origin mismatch. Add ${origin} to Authorized JavaScript origins in Google Cloud Console.`;
  }
  if (message.includes('Drive API')) {
    return 'Drive access failed. Enable the Google Drive API for your OAuth project and try again.';
  }

  return message || fallback;
}
