/**
 * App-wide Google OAuth Client ID — set once when you deploy.
 * End users never paste this; they only click "Connect Google account".
 *
 * In Google Cloud Console, add authorized JavaScript origins for every URL
 * where the app runs (e.g. http://localhost:5173 and your production URL).
 */
export const DEFAULT_GOOGLE_CLIENT_ID =
  '679034226107-538feu00un5cmkggdiv999i2qjltu0ue.apps.googleusercontent.com';

export function resolveGoogleClientId(preferred?: string | null): string {
  const explicit = String(preferred || '').trim();
  if (explicit) return explicit;
  return DEFAULT_GOOGLE_CLIENT_ID.trim();
}

export function hasBuiltInGoogleClientId(): boolean {
  return Boolean(DEFAULT_GOOGLE_CLIENT_ID.trim());
}
