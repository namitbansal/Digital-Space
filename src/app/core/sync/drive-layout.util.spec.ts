import { describe, expect, it } from 'vitest';
import { describeDriveLayout } from './drive-layout.util';

describe('describeDriveLayout', () => {
  it('includes username subfolder when provided', () => {
    expect(describeDriveLayout('Personal Vault', 'MyUser')).toBe('Personal Vault / myuser');
  });

  it('returns app folder only without username', () => {
    expect(describeDriveLayout('Personal Vault')).toBe('Personal Vault');
  });
});
