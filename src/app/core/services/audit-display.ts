import { AuditEntry } from '../models/vault.models';

export function formatAuditTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function auditCategory(action: string): string {
  if (action.startsWith('session.')) return 'Session';
  if (action.startsWith('item.')) return 'Item';
  if (action.startsWith('attachment.')) return 'File';
  if (action.startsWith('folder.')) return 'Category';
  if (action.startsWith('profile.')) return 'Profile';
  if (action.startsWith('vault.')) return 'Vault';
  if (action.startsWith('sync.')) return 'Sync';
  return 'Activity';
}

export function auditProfileLabel(
  entry: AuditEntry,
  profileNameById?: ReadonlyMap<string, string>,
): string | null {
  const meta = entry.meta;
  if (!meta) return null;
  if (meta['profile']) return String(meta['profile']);
  if (meta['profileName']) return String(meta['profileName']);
  const profileId = meta['profileId'];
  if (profileId && profileNameById) {
    return profileNameById.get(String(profileId)) || null;
  }
  if (entry.action.startsWith('profile.') && meta['name']) {
    return String(meta['name']);
  }
  return null;
}

export function auditMetaLine(
  entry: AuditEntry,
  profileNameById?: ReadonlyMap<string, string>,
): string | null {
  const meta = entry.meta;
  if (!meta || !Object.keys(meta).length) return null;
  const parts: string[] = [];

  const profileLabel = auditProfileLabel(entry, profileNameById);
  if (profileLabel) parts.push(`Profile: ${profileLabel}`);

  if (meta['type']) parts.push(`Type: ${meta['type']}`);
  if (meta['name'] && !entry.action.startsWith('profile.')) parts.push(String(meta['name']));
  if (meta['fileName']) parts.push(`File: ${meta['fileName']}`);
  if (meta['files']) parts.push(`Files: ${meta['files']}`);
  if (meta['fileCount']) parts.push(`${meta['fileCount']} file(s)`);
  if (meta['title'] && !entry.summary.includes(String(meta['title']))) {
    parts.push(String(meta['title']));
  }
  return parts.length ? parts.join(' · ') : null;
}
