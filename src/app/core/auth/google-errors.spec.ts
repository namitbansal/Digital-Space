import { describe, expect, it } from 'vitest';
import { getOAuthOrigin, googleErrorMessage } from './google-errors';

describe('googleErrorMessage', () => {
  it('maps NO_CLIENT_ID', () => {
    const err = Object.assign(new Error('NO_CLIENT_ID'), { code: 'NO_CLIENT_ID' });
    expect(googleErrorMessage(err)).toContain('Client ID');
  });

  it('maps popup closed', () => {
    const err = Object.assign(new Error('popup_closed_by_user'), { code: 'POPUP_CLOSED' });
    expect(googleErrorMessage(err)).toContain('popup');
  });

  it('maps origin mismatch', () => {
    const err = Object.assign(new Error('origin mismatch'), { code: 'ORIGIN_MISMATCH' });
    expect(googleErrorMessage(err)).toContain('Authorized JavaScript origins');
  });

  it('maps Drive verification failures', () => {
    const err = Object.assign(new Error('Drive API 403'), { code: 'DRIVE_VERIFY_FAILED' });
    expect(googleErrorMessage(err)).toContain('Drive');
  });
});

describe('getOAuthOrigin', () => {
  it('returns localhost fallback without window', () => {
    expect(getOAuthOrigin()).toBe('http://localhost:5173');
  });
});
