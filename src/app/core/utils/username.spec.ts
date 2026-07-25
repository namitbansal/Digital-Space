import { describe, expect, it } from 'vitest';
import {
  USERNAME_FORMAT_HINT,
  USERNAME_TAKEN_MESSAGE,
  isValidUsername,
  normalizeUsername,
  usernameError,
} from './username';

describe('username utils', () => {
  it('normalizes to lowercase trimmed', () => {
    expect(normalizeUsername('  MyUser  ')).toBe('myuser');
  });

  it('accepts valid usernames', () => {
    expect(isValidUsername('myvault')).toBe(true);
    expect(isValidUsername('user_123')).toBe(true);
    expect(usernameError('abc')).toBeNull();
  });

  it('rejects invalid usernames', () => {
    expect(usernameError('')).toBe('Username is required.');
    expect(usernameError('ab')).toContain('at least 3');
    expect(usernameError('1bad')).toContain('lowercase');
    expect(usernameError('Has Space')).toContain('lowercase');
  });

  it('exposes stable hint and taken messages', () => {
    expect(USERNAME_FORMAT_HINT).toBe('Lowercase letters, numbers, underscore only.');
    expect(USERNAME_TAKEN_MESSAGE).toContain(USERNAME_FORMAT_HINT);
  });
});
