import { describe, expect, it } from 'vitest';
import { AuditEntry } from '../models/vault.models';
import { auditMetaLine, auditProfileLabel } from './audit-display';

const profiles = new Map([
  ['prof_me', 'Me'],
  ['prof_spouse', 'Spouse'],
]);

function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'aud_test',
    at: '2026-01-01T12:00:00.000Z',
    action: 'item.create',
    summary: 'Added “Gmail”',
    meta: {},
    ...partial,
  };
}

describe('audit display', () => {
  it('shows profile from meta.profile', () => {
    const e = entry({ meta: { profile: 'Spouse' } });
    expect(auditProfileLabel(e, profiles)).toBe('Spouse');
    expect(auditMetaLine(e, profiles)).toContain('Profile: Spouse');
  });

  it('resolves profile name from profileId for older entries', () => {
    const e = entry({ meta: { profileId: 'prof_spouse', title: 'Gmail' } });
    expect(auditProfileLabel(e, profiles)).toBe('Spouse');
    expect(auditMetaLine(e, profiles)).toContain('Profile: Spouse');
  });
});
