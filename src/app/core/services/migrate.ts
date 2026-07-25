import { VaultData } from '../models/vault.models';
import { nowIso } from '../utils/id';

export function ensureVaultShape(vault: VaultData): { vault: VaultData; changed: boolean } {
  if (!vault || typeof vault !== 'object') return { vault, changed: false };
  const ts = nowIso();
  let changed = false;
  const mark = () => {
    changed = true;
  };

  if (!Array.isArray(vault.profiles) || vault.profiles.length === 0) {
    vault.profiles = [{ id: 'prof_me', name: 'Me', relationship: 'self', color: '#2563eb', createdAt: ts }];
    mark();
  }
  if (!vault.activeProfileId || !vault.profiles.some((p) => p.id === vault.activeProfileId)) {
    vault.activeProfileId = vault.profiles[0].id;
    mark();
  }
  if (!Array.isArray(vault.folders)) {
    vault.folders = [];
    mark();
  }
  if (!Array.isArray(vault.items)) {
    vault.items = [];
    mark();
  }
  if (!Array.isArray(vault.tags)) {
    vault.tags = [];
    mark();
  }
  if (!Array.isArray(vault.auditLog)) {
    vault.auditLog = [];
    mark();
  }
  if (!Array.isArray(vault.collections)) {
    vault.collections = [];
    mark();
  }
  if (!vault.sync || typeof vault.sync !== 'object') {
    vault.sync = {};
    mark();
  }
  if (vault.sync.googleAccountEmail && !vault.sync.googleIdentityEmail) {
    vault.sync.googleIdentityEmail = vault.sync.googleAccountEmail;
    vault.sync.googleIdentityId = vault.sync.googleAccountId;
    vault.sync.driveUsesSameGoogleAccount = vault.sync.driveUsesSameGoogleAccount ?? true;
    vault.sync.googleOnboardingComplete = vault.sync.googleOnboardingComplete ?? Boolean(vault.sync.googleAccountId);
    mark();
  }

  for (const item of vault.items) {
    if (!item.profileId) {
      item.profileId = vault.activeProfileId;
      mark();
    }
    if (!Array.isArray(item.folderIds)) {
      item.folderIds = Array.isArray(item.collectionIds) ? [...item.collectionIds] : [];
      mark();
    }
    if (!Array.isArray(item.customFields)) {
      item.customFields = [];
      mark();
    }
    if (!Array.isArray(item.attachments)) {
      item.attachments = [];
      mark();
    }
    if (item.type === 'certificate') {
      item.type = 'document';
      const f = item.fields || {};
      item.fields = {
        category: f['category'] || 'academic',
        docType: f['docType'] || f['certTitle'] || item.title || 'Certificate',
        documentNumber: f['documentNumber'] || f['certificateNumber'] || '',
        institution: f['institution'] || '',
        issued: f['issued'] || '',
        expires: f['expires'] || '',
        notes: f['notes'] || '',
      };
      mark();
    }
  }

  return { vault, changed };
}

export function defaultProfilesAndFolders(ts = nowIso(), ownerName = 'Me') {
  const name = ownerName.trim() || 'Me';
  const me = { id: 'prof_me', name, relationship: 'self', color: '#2563eb', createdAt: ts };
  return {
    profiles: [me],
    activeProfileId: me.id,
    folders: [],
  };
}
